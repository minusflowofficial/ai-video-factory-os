import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topic: text("topic"),
  niche: text("niche"),
  duration: text("duration"),
  aspectRatio: text("aspect_ratio"),
  captionStyle: text("caption_style"),
  voiceOption: text("voice_option"),
  voiceGender: text("voice_gender"),
  voiceLanguage: text("voice_language"),
  aiProvider: text("ai_provider"),
  status: text("status").notNull().default("draft"),
  script: text("script"),
  hook: text("hook"),
  cta: text("cta"),
  scenes: text("scenes"),
  keywords: text("keywords"),
  assets: text("assets"),
  voiceoverUrl: text("voiceover_url"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  renderProgress: integer("render_progress"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
