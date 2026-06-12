import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bulkJobsTable = pgTable("bulk_jobs", {
  id: serial("id").primaryKey(),
  niche: text("niche").notNull(),
  goal: text("goal"),
  totalVideos: integer("total_videos").notNull(),
  pendingCount: integer("pending_count").notNull().default(0),
  processingCount: integer("processing_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertBulkJobSchema = createInsertSchema(bulkJobsTable).omit({ id: true, createdAt: true });
export type InsertBulkJob = z.infer<typeof insertBulkJobSchema>;
export type BulkJob = typeof bulkJobsTable.$inferSelect;
