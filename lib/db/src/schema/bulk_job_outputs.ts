import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const bulkJobOutputsTable = pgTable("bulk_job_outputs", {
  id:          serial("id").primaryKey(),
  jobId:       integer("job_id").notNull(),
  filePath:    text("file_path").notNull(),
  quoteText:   text("quote_text"),
  videoIndex:  integer("video_index"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type BulkJobOutput = typeof bulkJobOutputsTable.$inferSelect;
