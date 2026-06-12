import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, projectsTable, bulkJobsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(projectsTable);
  const [completedRow] = await db.select({ count: sql<number>`count(*)` }).from(projectsTable).where(sql`status = 'completed'`);
  const [processingRow] = await db.select({ count: sql<number>`count(*)` }).from(projectsTable).where(sql`status IN ('scripting','fetching-assets','voiceover','rendering')`);
  const [bulkCountRow] = await db.select({ count: sql<number>`count(*)` }).from(bulkJobsTable);

  const recentProjects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)).limit(5);

  const statusRows = await db.select({
    status: projectsTable.status,
    count: sql<number>`count(*)`,
  }).from(projectsTable).groupBy(projectsTable.status);

  res.json({
    totalProjects: Number(countRow.count),
    completedVideos: Number(completedRow.count),
    processingVideos: Number(processingRow.count),
    totalBulkJobs: Number(bulkCountRow.count),
    recentProjects: recentProjects.map(p => ({
      id: p.id,
      title: p.title,
      topic: p.topic,
      niche: p.niche,
      duration: p.duration,
      aspectRatio: p.aspectRatio,
      captionStyle: p.captionStyle,
      voiceOption: p.voiceOption,
      voiceGender: p.voiceGender,
      voiceLanguage: p.voiceLanguage,
      aiProvider: p.aiProvider,
      status: p.status,
      script: p.script,
      hook: p.hook,
      cta: p.cta,
      scenes: p.scenes,
      keywords: p.keywords,
      assets: p.assets,
      voiceoverUrl: p.voiceoverUrl,
      videoUrl: p.videoUrl,
      thumbnailUrl: p.thumbnailUrl,
      renderProgress: p.renderProgress,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
    })),
    projectsByStatus: statusRows.map(r => ({ status: r.status, count: Number(r.count) })),
  });
});

export default router;
