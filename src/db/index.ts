import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize the high-performance LibSQL engine
const client = createClient({
  // Dynamic switch: uses Turso cluster URL if available, defaults to local SQLite file
  url: process.env.TURSO_DATABASE_URL ?? "file:sqlite.db",
  // Injects authentication tokens strictly for remote production access pipelines
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

/**
 * Ensures required storage definitions are securely created in the active cluster node.
 * Eliminates out-of-sync table state bugs during server restarts.
 */
export async function initializeDatabase(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL,
      suggested_gallery_caption TEXT,
      gallery_images TEXT NOT NULL,
      published_at TEXT NOT NULL
    )
  `);
}
