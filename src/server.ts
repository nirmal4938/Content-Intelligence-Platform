import "dotenv/config";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initializeDatabase } from "./db/index.js";
import { articlesTable } from "./db/schema.js";
import { convertChatToNews } from "./services/aiProcessor.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function formatArticle(article: typeof articlesTable.$inferSelect) {
  return {
    ...article,
    tags: JSON.parse(article.tags) as string[],
    galleryImages: JSON.parse(article.galleryImages) as string[],
  };
}

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 6, fields: 10 },
  });
  app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/",
    allowedPath: (_pathName, _root, request) =>
      path.posix
        .basename(new URL(request.url, "http://localhost").pathname)
        .toLowerCase() !== "admin.html",
  });

  app.get("/", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").sendFile("index.html"),
  );
  app.get("/admin", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").sendFile("admin.html"),
  );
  app.get("/admin/", async (_request, reply) =>
    reply.redirect("/admin"),
  );

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/articles", async (_request, reply) => {
    try {
      const articles = await db
        .select()
        .from(articlesTable)
        .orderBy(desc(articlesTable.id));

      return reply.send(articles.map(formatArticle));
    } catch (error) {
      app.log.error({ err: error }, "Unable to retrieve articles");
      return reply.code(500).send({ error: "Unable to retrieve articles." });
    }
  });

  app.post("/api/ingest/batch", async (request, reply) => {
    let chatLogs = "";
    const imageUploads: Array<{ filename: string; buffer: Buffer }> = [];
    const savedImagePaths: string[] = [];

    try {
      if (!request.isMultipart()) {
        return reply
          .code(415)
          .send({ error: "Upload chat logs using a multipart form." });
      }

      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname === "chatLogs") {
            chatLogs = (await part.toBuffer()).toString("utf8");
          } else if (part.fieldname === "images") {
            const extension = IMAGE_EXTENSIONS[part.mimetype];
            if (!extension) {
              await part.toBuffer();
              return reply.code(400).send({
                error: "Image uploads must use JPEG, PNG, GIF, WebP, or AVIF.",
              });
            }

            imageUploads.push({
              filename: `${randomUUID()}${extension}`,
              buffer: await part.toBuffer(),
            });
          } else {
            await part.toBuffer();
          }
        } else if (part.fieldname === "chatLogs" && typeof part.value === "string") {
          chatLogs = part.value;
        }
      }

      if (!chatLogs.trim()) {
        return reply.code(400).send({
          error: "Upload a non-empty WhatsApp chat export (.txt) to continue.",
        });
      }

      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      for (const image of imageUploads) {
        const imagePath = path.join(UPLOAD_DIR, image.filename);
        await fs.writeFile(imagePath, image.buffer, { flag: "wx" });
        savedImagePaths.push(imagePath);
      }

      const article = await convertChatToNews({
        chatLogs,
        hasImages: imageUploads.length > 0,
      });
      const [savedArticle] = await db
        .insert(articlesTable)
        .values({
          ...article,
          suggestedGalleryCaption: article.suggestedGalleryCaption ?? null,
          tags: JSON.stringify(article.tags),
          galleryImages: JSON.stringify(
            imageUploads.map((image) => `/uploads/${image.filename}`),
          ),
          publishedAt: new Date().toISOString(),
        })
        .returning();

      if (!savedArticle) {
        throw new Error("The article was not returned after insertion.");
      }

      return reply.code(201).send({
        message: "Article analyzed and published.",
        data: formatArticle(savedArticle),
      });
    } catch (error) {
      await Promise.all(
        savedImagePaths.map(async (imagePath) => {
          try {
            await fs.unlink(imagePath);
          } catch (cleanupError) {
            app.log.error(
              { err: cleanupError, imagePath },
              "Unable to clean up an uploaded image",
            );
          }
        }),
      );

      app.log.error({ err: error }, "Unable to process WhatsApp upload");
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode < 500
          ? error.statusCode
          : 500;
      const message =
        statusCode < 500 && error instanceof Error
          ? error.message
          : "Unable to process this upload. Check the server configuration and try again.";
      return reply.code(statusCode).send({ error: message });
    }
  });

  return app;
}

async function start(): Promise<void> {
  const app = buildServer();

  try {
    await initializeDatabase();
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const port = Number(process.env.PORT ?? 3000);
    await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
  } catch (error) {
    app.log.error({ err: error }, "Unable to start the news portal");
    await app.close();
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  await start();
}
