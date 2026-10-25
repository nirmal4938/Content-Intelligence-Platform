import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const articlesTable = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  tags: text("tags").notNull(),
  suggestedGalleryCaption: text("suggested_gallery_caption"),
  galleryImages: text("gallery_images").notNull(),
  publishedAt: text("published_at").notNull(),
});

export type InsertArticle = typeof articlesTable.$inferInsert;
export type SelectArticle = typeof articlesTable.$inferSelect;
