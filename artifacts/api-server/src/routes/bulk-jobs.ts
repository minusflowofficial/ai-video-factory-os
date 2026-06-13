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

  // Kick off real video pipeline in background
  runBulkPipeline(job.id, parsed.data.niche, parsed.data.totalVideos, parsed.data.aspectRatio ?? "9:16").catch(() => {});

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

// ── Real bulk video pipeline ──────────────────────────────────────────────────
async function runBulkPipeline(jobId: number, niche: string, totalVideos: number, aspectRatio: string) {
  const PORT = process.env.PORT ?? 8080;
  const BASE = `http://localhost:${PORT}`;
  const CONCURRENCY = 2;

  await db.update(bulkJobsTable).set({
    status: "processing",
    processingCount: Math.min(CONCURRENCY, totalVideos),
    updatedAt: new Date(),
  }).where(eq(bulkJobsTable.id, jobId));

  let completedCount = 0;
  let failedCount = 0;

  const processOne = async (videoNum: number) => {
    // Check for cancellation
    const [current] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!current || current.status === "cancelled") return;

    try {
      // 1. Create project
      const createRes = await fetch(`${BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${niche} #${videoNum}`,
          topic: niche,
          niche,
          duration: "60s",
          aspectRatio,
          captionStyle: "Bold Yellow",
        }),
      });
      if (!createRes.ok) throw new Error("project create failed");
      const project = await createRes.json();
      const pid = project.id;

      // 2. Generate assets
      await fetch(`${BASE}/api/projects/${pid}/generate-assets`, { method: "POST" });

      // 3. Select music
      await fetch(`${BASE}/api/projects/${pid}/generate-voiceover`, { method: "POST" });

      // 4. Kick off render
      await fetch(`${BASE}/api/projects/${pid}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showCaptions: false,
          showTitle: false,
          transitionEffect: "zoom",
          addSfx: false,
        }),
      });

      // 5. Poll until render finishes (max ~8 min)
      const RUNNING_STATUSES = new Set(["rendering", "scripting", "fetching-assets", "voiceover", "assets-ready", "music-ready", "processing"]);
      let attempts = 0;
      let finalStatus = "rendering";
      while (RUNNING_STATUSES.has(finalStatus) && attempts < 96) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(`${BASE}/api/projects/${pid}`);
        const statusData = await statusRes.json();
        finalStatus = statusData.status ?? "error";
        attempts++;
      }

      if (finalStatus === "completed") completedCount++;
      else failedCount++;
    } catch {
      failedCount++;
    }

    // Update progress in DB
    const remaining = totalVideos - completedCount - failedCount;
    await db.update(bulkJobsTable).set({
      completedCount,
      failedCount,
      pendingCount: Math.max(0, remaining),
      processingCount: Math.min(CONCURRENCY, remaining),
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
  };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < totalVideos; i += CONCURRENCY) {
    const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!job || job.status === "cancelled") break;

    const batch = Array.from({ length: Math.min(CONCURRENCY, totalVideos - i) }, (_, k) => i + k + 1);
    await Promise.all(batch.map(n => processOne(n)));
  }

  // Mark final status
  const [finalJob] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
  if (finalJob && finalJob.status !== "cancelled") {
    await db.update(bulkJobsTable).set({
      status: "completed",
      completedCount,
      failedCount,
      pendingCount: 0,
      processingCount: 0,
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
  }
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
