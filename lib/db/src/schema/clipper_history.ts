import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clipperHistoryTable = pgTable("clipper_history", {
  id:           serial("id").primaryKey(),
  jobId:        text("job_id").notNull().unique(),
  sourceType:   text("source_type").notNull(),   // "upload" | "youtube"
  sourceUrl:    text("source_url"),              // YouTube URL if applicable
  filename:     text("filename"),                // original upload filename
  aspectRatio:  text("aspect_ratio").notNull(),
  captionStyle: text("caption_style").notNull(),
  numClips:     integer("num_clips").notNull().default(0),
  doneClips:    integer("done_clips").notNull().default(0),
  status:       text("status").notNull().default("done"),
  clipsJson:    text("clips_json"),              // serialized clips array for restore
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export const insertClipperHistorySchema = createInsertSchema(clipperHistoryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClipperHistory = z.infer<typeof insertClipperHistorySchema>;
export type ClipperHistory = typeof clipperHistoryTable.$inferSelect;
