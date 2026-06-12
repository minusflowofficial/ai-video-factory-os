import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  GenerateScriptParams,
  GenerateAssetsParams,
  GenerateVoiceoverParams,
  RenderProjectParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 50;
  const offset = query.data.offset ?? 0;
  let q = db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)).limit(limit).offset(offset);
  const projects = await q;
  res.json(projects.map(serializeProject));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db.insert(projectsTable).values({
    title: parsed.data.title,
    topic: parsed.data.topic ?? null,
    niche: parsed.data.niche ?? null,
    duration: parsed.data.duration ?? "60s",
    aspectRatio: parsed.data.aspectRatio ?? "16:9",
    captionStyle: parsed.data.captionStyle ?? "Modern Minimal",
    voiceOption: parsed.data.voiceOption ?? "generate",
    voiceGender: parsed.data.voiceGender ?? "female",
    voiceLanguage: parsed.data.voiceLanguage ?? "en-US",
    aiProvider: parsed.data.aiProvider ?? "gemini",
    status: "draft",
  }).returning();
  res.status(201).json(serializeProject(project));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(serializeProject(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title != null) updateData.title = parsed.data.title;
  if (parsed.data.topic != null) updateData.topic = parsed.data.topic;
  if (parsed.data.niche != null) updateData.niche = parsed.data.niche;
  if (parsed.data.duration != null) updateData.duration = parsed.data.duration;
  if (parsed.data.aspectRatio != null) updateData.aspectRatio = parsed.data.aspectRatio;
  if (parsed.data.captionStyle != null) updateData.captionStyle = parsed.data.captionStyle;
  if (parsed.data.voiceOption != null) updateData.voiceOption = parsed.data.voiceOption;
  if (parsed.data.voiceGender != null) updateData.voiceGender = parsed.data.voiceGender;
  if (parsed.data.voiceLanguage != null) updateData.voiceLanguage = parsed.data.voiceLanguage;
  if (parsed.data.aiProvider != null) updateData.aiProvider = parsed.data.aiProvider;
  if (parsed.data.script != null) updateData.script = parsed.data.script;
  if (parsed.data.hook != null) updateData.hook = parsed.data.hook;
  if (parsed.data.cta != null) updateData.cta = parsed.data.cta;
  if (parsed.data.scenes != null) updateData.scenes = parsed.data.scenes;
  if (parsed.data.keywords != null) updateData.keywords = parsed.data.keywords;

  const [project] = await db.update(projectsTable).set(updateData).where(eq(projectsTable.id, id)).returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(serializeProject(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/projects/:id/generate-script", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const topic = project.topic ?? project.title;
  const hook = `Did you know that ${topic} is changing everything right now?`;
  const body = `In this video, we'll explore the most important aspects of ${topic}. From the fundamentals to advanced strategies, you'll walk away with actionable insights that you can implement immediately. The landscape is shifting rapidly, and those who adapt early will gain a massive advantage.`;
  const cta = `Like and subscribe for more content on ${topic}. Drop your questions in the comments below!`;
  const scenes = JSON.stringify([
    { id: 1, text: hook, duration: 5, visualIntent: `dramatic opening shot related to ${topic}`, keywords: [topic, "dramatic", "cinematic"] },
    { id: 2, text: "The landscape is shifting rapidly...", duration: 10, visualIntent: `dynamic b-roll showing ${topic} in action`, keywords: [topic, "dynamic", "action"] },
    { id: 3, text: body, duration: 20, visualIntent: `informational visuals about ${topic}`, keywords: [topic, "information", "educational"] },
    { id: 4, text: cta, duration: 5, visualIntent: "call to action overlay", keywords: ["subscribe", "like", "engage"] },
  ]);
  const keywords = JSON.stringify([topic, "viral", "trending", "educational", "tips", "strategy", "2024", "AI", "automation"]);

  const [updated] = await db.update(projectsTable).set({
    status: "scripting",
    script: `${hook}\n\n${body}\n\n${cta}`,
    hook,
    cta,
    scenes,
    keywords,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(updated));
});

router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const topic = encodeURIComponent(project.topic ?? project.title);
  const assets = JSON.stringify([
    { id: 1, type: "video", url: `https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_25fps.mp4`, thumbnail: `https://images.pexels.com/photos/3129671/pexels-photo-3129671.jpeg?w=400`, source: "pexels", keyword: project.topic ?? project.title },
    { id: 2, type: "video", url: `https://videos.pexels.com/video-files/2022395/2022395-uhd_2560_1440_25fps.mp4`, thumbnail: `https://images.pexels.com/photos/2022395/pexels-photo-2022395.jpeg?w=400`, source: "pexels", keyword: "cinematic" },
    { id: 3, type: "image", url: `https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg`, thumbnail: `https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=400`, source: "pexels", keyword: "business" },
    { id: 4, type: "video", url: `https://videos.pexels.com/video-files/1409899/1409899-uhd_2560_1440_24fps.mp4`, thumbnail: `https://images.pexels.com/photos/1409899/pexels-photo-1409899.jpeg?w=400`, source: "pexels", keyword: "technology" },
  ]);

  const [updated] = await db.update(projectsTable).set({
    status: "fetching-assets",
    assets,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(updated));
});

router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    voiceoverUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(updated));
});

router.post("/projects/:id/render", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  // Simulate async render completion
  setTimeout(async () => {
    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: "https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_25fps.mp4",
      thumbnailUrl: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=400",
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
  }, 8000);

  res.json(serializeProject(updated));
});

function serializeProject(p: typeof projectsTable.$inferSelect) {
  return {
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
  };
}

export default router;
