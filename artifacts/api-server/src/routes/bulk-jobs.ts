import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, bulkJobsTable } from "@workspace/db";
import {
  CreateBulkJobBody,
  GetBulkJobParams,
  CancelBulkJobParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bulk-jobs", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(bulkJobsTable).orderBy(desc(bulkJobsTable.createdAt));
  res.json(jobs.map(serializeBulkJob));
});

router.post("/bulk-jobs", async (req, res): Promise<void> => {
  const parsed = CreateBulkJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [job] = await db.insert(bulkJobsTable).values({
    niche: parsed.data.niche,
    goal: parsed.data.goal ?? null,
    totalVideos: parsed.data.totalVideos,
    pendingCount: parsed.data.totalVideos,
    processingCount: 0,
    completedCount: 0,
    failedCount: 0,
    status: "pending",
  }).returning();

  // Simulate processing
  simulateBulkProgress(job.id, parsed.data.totalVideos);

  res.status(201).json(serializeBulkJob(job));
});

router.get("/bulk-jobs/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Bulk job not found" });
    return;
  }
  res.json(serializeBulkJob(job));
});

router.post("/bulk-jobs/:id/cancel", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.update(bulkJobsTable).set({
    status: "cancelled",
    updatedAt: new Date(),
  }).where(eq(bulkJobsTable.id, id)).returning();
  if (!job) {
    res.status(404).json({ error: "Bulk job not found" });
    return;
  }
  res.json(serializeBulkJob(job));
});

async function simulateBulkProgress(jobId: number, total: number) {
  const batchSize = Math.max(1, Math.floor(total / 10));
  let completed = 0;
  const interval = setInterval(async () => {
    const [current] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!current || current.status === "cancelled") {
      clearInterval(interval);
      return;
    }
    completed = Math.min(completed + batchSize, total);
    const remaining = total - completed;
    const isLast = completed >= total;
    await db.update(bulkJobsTable).set({
      status: isLast ? "completed" : "processing",
      completedCount: completed,
      pendingCount: remaining,
      processingCount: isLast ? 0 : Math.min(batchSize, remaining),
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
    if (isLast) clearInterval(interval);
  }, 3000);
}

function serializeBulkJob(j: typeof bulkJobsTable.$inferSelect) {
  return {
    id: j.id,
    niche: j.niche,
    goal: j.goal,
    totalVideos: j.totalVideos,
    pendingCount: j.pendingCount,
    processingCount: j.processingCount,
    completedCount: j.completedCount,
    failedCount: j.failedCount,
    status: j.status,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt ? j.updatedAt.toISOString() : null,
  };
}

export default router;
