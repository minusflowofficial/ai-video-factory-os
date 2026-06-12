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

// ---------------------------------------------------------------------------
// Mixkit CDN asset bank — curated IDs by category
// Video:  https://assets.mixkit.co/videos/{id}/{id}-360.mp4
// Thumb:  https://assets.mixkit.co/videos/{id}/{id}-thumb-360-0.jpg
// Music:  https://assets.mixkit.co/music/{id}/{id}.mp3
// SFX:    https://assets.mixkit.co/active_storage/sfx/{id}/{id}-preview.mp3
// ---------------------------------------------------------------------------
const MIXKIT_VIDEOS: Record<string, number[]> = {
  technology:  [2523, 2524, 2525, 2526, 2527],
  business:    [2586, 2587, 2588, 2589, 2590],
  nature:      [1120, 1121, 1122, 1123, 1124],
  fitness:     [2580, 2581, 2582, 2583, 2584],
  crypto:      [2528, 2530, 2531, 2532, 2533],
  finance:     [2534, 2535, 2536, 2537, 2538],
  food:        [2350, 2351, 2352, 2353, 2354],
  travel:      [2553, 2554, 2555, 2556, 2557],
  people:      [2867, 2868, 2869, 2870, 2871],
  abstract:    [1487, 1488, 1489, 1490, 1491],
  default:     [2523, 2588, 1122, 2867, 1487],
};

function getVideoIds(topic: string): number[] {
  const t = topic.toLowerCase();
  if (t.match(/tech|ai|software|digital|computer|code/)) return MIXKIT_VIDEOS.technology;
  if (t.match(/business|market|startup|brand|sales|agency/)) return MIXKIT_VIDEOS.business;
  if (t.match(/nature|outdoor|landscape|forest|ocean/)) return MIXKIT_VIDEOS.nature;
  if (t.match(/fit|health|workout|gym|sport|exercise/)) return MIXKIT_VIDEOS.fitness;
  if (t.match(/crypto|bitcoin|blockchain|nft|defi|web3/)) return MIXKIT_VIDEOS.crypto;
  if (t.match(/finance|money|invest|stock|wealth|trading/)) return MIXKIT_VIDEOS.finance;
  if (t.match(/food|recipe|cook|eat|restaurant|meal/)) return MIXKIT_VIDEOS.food;
  if (t.match(/travel|adventure|trip|explore|tour/)) return MIXKIT_VIDEOS.travel;
  if (t.match(/people|person|human|social|life|motivat/)) return MIXKIT_VIDEOS.people;
  return MIXKIT_VIDEOS.default;
}

function mixkitVideoUrl(id: number) {
  return `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`;
}
function mixkitThumbUrl(id: number) {
  return `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`;
}

// ---------------------------------------------------------------------------

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 50;
  const offset = query.data.offset ?? 0;
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.createdAt))
    .limit(limit)
    .offset(offset);
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
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(serializeProject(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(projectsTable).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(serializeProject(updated));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Project not found" }); return; }
  res.sendStatus(204);
});

// Pipeline: Generate Script
router.post("/projects/:id/generate-script", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

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
  const keywords = JSON.stringify([topic, "viral", "trending", "educational", "tips", "strategy", "2025", "AI", "automation"]);

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

// Pipeline: Fetch Assets — Mixkit CDN
router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const topic = project.topic ?? project.niche ?? project.title;
  const videoIds = getVideoIds(topic);
  // pick 4 videos from the category pool
  const picked = videoIds.slice(0, 4);

  const assets = JSON.stringify(picked.map((mixkitId, i) => ({
    id: i + 1,
    type: "video",
    mixkitId,
    url: mixkitVideoUrl(mixkitId),
    thumbnail: mixkitThumbUrl(mixkitId),
    source: "mixkit",
    keyword: topic,
  })));

  const [updated] = await db.update(projectsTable).set({
    status: "fetching-assets",
    assets,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(updated));
});

// Pipeline: Generate Voiceover — Mixkit SFX placeholder
router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    voiceoverUrl: "https://assets.mixkit.co/active_storage/sfx/213/213-preview.mp3",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(updated));
});

// Pipeline: Render — use Mixkit video as output
router.post("/projects/:id/render", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Pick a representative Mixkit output video based on topic
  const topic = project.topic ?? project.niche ?? project.title;
  const ids = getVideoIds(topic);
  const outputId = ids[0] ?? 2523;

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  // Simulate async render
  setTimeout(async () => {
    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: mixkitVideoUrl(outputId),
      thumbnailUrl: mixkitThumbUrl(outputId),
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
  }, 800);

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
