import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  geminiKey: text("gemini_key"),
  openaiKey: text("openai_key"),
  claudeKey: text("claude_key"),
  groqKey: text("groq_key"),
  pexelsKey: text("pexels_key"),
  pixabayKey: text("pixabay_key"),
  unsplashKey: text("unsplash_key"),
  defaultAiProvider: text("default_ai_provider"),
  defaultDuration: text("default_duration"),
  defaultAspectRatio: text("default_aspect_ratio"),
  storageProvider: text("storage_provider"),
  updatedAt: timestamp("updated_at"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
