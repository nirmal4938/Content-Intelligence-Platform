import { z } from "zod";

export const NewsArticleSchema = z.object({
  title: z
    .string()
    .describe(
      "A catchy, journalism-style headline capturing the essence of the group discussion.",
    ),
  category: z
    .enum([
      "Announcement",
      "Tech News",
      "Discussion",
      "Marketplace",
      "Event",
      "General",
    ])
    .describe("The primary classification of this post."),
  summary: z
    .string()
    .describe("A concise 2-sentence summary of the main discussion thread."),
  content: z
    .string()
    .describe(
      "The full structured body text derived from the chat transcripts, formatted with clean paragraphs.",
    ),
  tags: z.array(z.string()).describe("3 to 5 searchable keyword tags."),
  suggestedGalleryCaption: z
    .string()
    .optional()
    .describe(
      "If an image was present, provide a refined, professional image caption.",
    ),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;
