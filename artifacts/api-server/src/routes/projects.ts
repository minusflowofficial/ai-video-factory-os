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
// Mixkit CDN — confirmed working IDs (server-side tested 200)
// Video:  https://assets.mixkit.co/videos/{id}/{id}-360.mp4
// Thumb:  https://assets.mixkit.co/videos/{id}/{id}-thumb-360-0.jpg
// Music:  https://assets.mixkit.co/music/{id}/{id}.mp3
// All served via /api/proxy/media to bypass browser CORS restrictions
// ---------------------------------------------------------------------------

const MIXKIT_VIDEOS: Record<string, number[]> = {
  technology:  [2523, 2524, 2525, 2526, 2527, 4007, 4008, 4009],
  business:    [2586, 2587, 2588, 2589, 2590, 2867, 2868, 2869],
  nature:      [1120, 1121, 1122, 1123, 1124, 1487, 1488, 1489],
  fitness:     [2580, 2581, 2582, 2583, 2584],
  crypto:      [2528, 2530, 2531, 2532, 2533],
  finance:     [2534, 2535, 2536, 2537, 2538],
  travel:      [2553, 2554, 2555, 2556, 2557],
  people:      [2867, 2868, 2869, 2870, 2871, 4010, 4011, 4012],
  abstract:    [1487, 1488, 1489, 1490, 1491, 4013],
  default:     [2523, 2588, 1122, 2867, 1487, 4007, 4008],
};

// Stop-words for keyword extraction
const STOP_WORDS = new Set([
  "the","a","an","and","or","is","in","of","to","for","with","how","why",
  "what","when","where","that","this","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should","may",
  "might","about","from","by","as","at","on","into","more","most","best",
  "top","your","you","my","we","our","us","i","it","its","all","any","one",
  "two","three","five","ten","100","can","get","make","use","just","also",
  "but","not","so","if","then","their","they","them","its","video","content",
  "watch","like","share","comment","subscribe","click","here","now","help",
]);

function extractKeywords(title: string, topic?: string | null, niche?: string | null): string[] {
  const text = `${title} ${topic ?? ""} ${niche ?? ""}`.toLowerCase();
  const words = (text.match(/\b[a-z]{3,}\b/g) ?? []).filter(w => !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

function detectCategory(title: string, topic?: string | null, niche?: string | null): string {
  const t = `${title} ${topic ?? ""} ${niche ?? ""}`.toLowerCase();
  if (t.match(/tech|ai|artificial|software|digital|computer|code|program|app|web|data|automation|robot|machine|internet|cyber/)) return "technology";
  if (t.match(/business|market|startup|brand|sales|agency|company|entrepreneur|corporate|professional|office|product|client/)) return "business";
  if (t.match(/nature|outdoor|landscape|forest|ocean|mountain|river|wildlife|plant|garden|tree|sky|earth|animal/)) return "nature";
  if (t.match(/fit|health|workout|gym|sport|exercise|yoga|run|body|weight|muscle|wellness|diet|nutrition/)) return "fitness";
  if (t.match(/crypto|bitcoin|blockchain|nft|defi|web3|token|coin|currency|decen/)) return "crypto";
  if (t.match(/finance|money|invest|stock|wealth|trading|fund|bank|budget|saving|income|profit|revenue|financial/)) return "finance";
  if (t.match(/travel|adventure|trip|explore|tour|journey|vacation|visit|destination|country|culture/)) return "travel";
  if (t.match(/motivat|inspire|success|mindset|productivity|habit|goal|focus|growth|dream|confidence|self|personal/)) return "people";
  return "default";
}

function mixkitVideoUrl(id: number) { return `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`; }
function mixkitThumbUrl(id: number) { return `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`; }

function pickVideos(category: string, count = 4): number[] {
  const pool = MIXKIT_VIDEOS[category] ?? MIXKIT_VIDEOS.default;
  const picked: number[] = [];
  for (let i = 0; i < count; i++) picked.push(pool[i % pool.length]);
  return picked;
}

// ---------------------------------------------------------------------------

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const limit = query.data.limit ?? 50;
  const offset = query.data.offset ?? 0;
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)).limit(limit).offset(offset);
  res.json(projects.map(serializeProject));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeProject(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(projectsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projectsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeProject(updated));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Script
// Extracts real keywords from title+topic+niche and builds a relevant script
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-script", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const title  = project.title;
  const topic  = project.topic ?? title;
  const niche  = project.niche ?? "";
  const kws    = extractKeywords(title, topic, niche);
  const kwStr  = kws.slice(0, 4).join(", ");

  const hook   = `${title} — here's what nobody tells you.`;
  const body   = `In this video, we break down everything you need to know about ${topic || title}. `
    + `Whether you're a beginner or already familiar with ${kws[0] ?? title}, you'll find `
    + `actionable insights you can apply immediately. We'll cover ${kws.slice(0, 3).join(", ")} `
    + `and why mastering these concepts puts you ahead of 95% of people in this space.`;
  const cta    = `If this was valuable, smash that like button and subscribe — we post weekly on ${niche || title}. Drop a comment below!`;

  const fullScript = `${hook}\n\n${body}\n\n${cta}`;

  // Build scenes with per-scene keywords derived from title words
  const scenes = JSON.stringify([
    {
      id: 1, text: hook, duration: 5,
      visualIntent: `Opening shot — ${kws[0] ?? title} theme`,
      keywords: kws.slice(0, 3),
    },
    {
      id: 2, text: "Key concept breakdown...", duration: 15,
      visualIntent: `${kws[1] ?? title} in action — dynamic b-roll`,
      keywords: kws.slice(1, 4),
    },
    {
      id: 3, text: body, duration: 25,
      visualIntent: `Educational visuals — ${kws[2] ?? title}`,
      keywords: kws.slice(2, 5),
    },
    {
      id: 4, text: cta, duration: 5,
      visualIntent: `Call-to-action overlay — ${niche || title}`,
      keywords: kws.slice(0, 2),
    },
  ]);

  const [updated] = await db.update(projectsTable).set({
    status: "scripting",
    script: fullScript,
    hook,
    cta,
    scenes,
    keywords: JSON.stringify(kws),
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Fetch Assets — picks Mixkit clips matching title category
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const kws = extractKeywords(project.title, project.topic, project.niche);
  const ids = pickVideos(category, 4);

  const assets = JSON.stringify(ids.map((mixkitId, i) => ({
    id: i + 1,
    type: "video",
    mixkitId,
    url: mixkitVideoUrl(mixkitId),
    thumbnail: mixkitThumbUrl(mixkitId),
    source: "mixkit",
    category,
    keyword: kws[i] ?? kws[0] ?? project.title,
  })));

  const [updated] = await db.update(projectsTable).set({
    status: "fetching-assets",
    assets,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Voiceover (simulated — marks step done)
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    voiceoverUrl: "https://assets.mixkit.co/music/738/738.mp3",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Render — uses category-matched Mixkit clip as output video
// Completes in 800 ms via async DB update; client polls for "completed"
// ---------------------------------------------------------------------------
router.post("/projects/:id/render", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const ids = pickVideos(category, 4);
  const outputId = ids[0];

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  // Simulate render — completes after 800 ms; frontend polls for status change
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
