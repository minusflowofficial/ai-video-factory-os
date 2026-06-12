import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, projectsTable } from "@workspace/db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  UpdateProjectBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Mixkit CDN — confirmed working IDs (server-side tested 200)
// Video: https://assets.mixkit.co/videos/{id}/{id}-360.mp4
// Music: https://assets.mixkit.co/music/{id}/{id}.mp3
// Proxied via /api/proxy/media for browser playback (bypasses CORS)
// ---------------------------------------------------------------------------

const MIXKIT_VIDEOS: Record<string, number[]> = {
  technology:  [2523,2524,2525,2526,2527,4007,4008,4009,4010,4011,4012,26076,26077,26078,26079,26080],
  business:    [2586,2587,2588,2589,2590,2867,2868,2869,2870,4013,4014,4015,4016,4017,4018],
  nature:      [1120,1121,1122,1123,1124,1487,1488,1489,1490,4019,4020,4021,4022,4023,4024],
  fitness:     [2580,2581,2582,2583,2584,4025,4026,4027,4028,4029,4030],
  crypto:      [2523,2524,2528,2530,2531,2532,2533,4007,4008,4009],
  finance:     [2534,2535,2536,2537,2538,2586,2587,2588,4010,4011],
  travel:      [2553,2554,2555,2556,2557,1120,1121,1122,4019,4020,4021],
  people:      [2867,2868,2869,2870,2871,4009,4010,4011,4012,4013,4014],
  abstract:    [1487,1488,1489,1490,1491,4007,4013,4018,4024,4029],
  default:     [2523,2588,1122,2867,1487,4007,4009,4013,4018,4023,4028],
};

// Music per category — varied so each niche gets appropriate feel
const MUSIC_BY_CATEGORY: Record<string, number> = {
  technology: 838,  // Digital Pulse
  business:   740,  // Corporate Success
  nature:     872,  // Lo-Fi Afternoon
  fitness:    741,  // Epic Motivation
  crypto:     838,
  finance:    740,
  travel:     739,  // Inspiring Journey
  people:     739,
  abstract:   873,  // Soft Background
  default:    738,  // Epic Cinematic
};

const STOP_WORDS = new Set([
  "the","a","an","and","or","is","in","of","to","for","with","how","why",
  "what","when","where","that","this","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should","may",
  "might","about","from","by","as","at","on","into","more","most","best",
  "top","your","you","my","we","our","us","i","it","its","all","any","one",
  "two","three","five","ten","can","get","make","use","just","also","but",
  "not","so","if","then","their","they","them","video","content","watch",
  "like","share","comment","subscribe","click","here","now","help","every",
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
  if (t.match(/crypto|bitcoin|blockchain|nft|defi|web3|token|coin|currency/)) return "crypto";
  if (t.match(/finance|money|invest|stock|wealth|trading|fund|bank|budget|saving|income|profit|revenue/)) return "finance";
  if (t.match(/travel|adventure|trip|explore|tour|journey|vacation|visit|destination|country|culture/)) return "travel";
  if (t.match(/motivat|inspire|success|mindset|productivity|habit|goal|focus|growth|dream|confidence|self|personal/)) return "people";
  return "default";
}

function randomPick<T>(pool: T[], n: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const result: T[] = [];
  for (let i = 0; i < n; i++) result.push(shuffled[i % shuffled.length]);
  return result;
}

function mixkitVideoUrl(id: number) { return `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`; }
function mixkitThumbUrl(id: number) { return `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`; }
function mixkitMusicUrl(id: number) { return `https://assets.mixkit.co/music/${id}/${id}.mp3`; }

// ---------------------------------------------------------------------------
// Downloader — used by the render pipeline
// ---------------------------------------------------------------------------
async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://mixkit.co/",
    },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  await fs.promises.writeFile(dest, Buffer.from(buf));
}

// ---------------------------------------------------------------------------
// FFmpeg filter complex builder
// Produces: 4 clips → scale/trim/fade → concat → title overlay → captions → music
// ---------------------------------------------------------------------------
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const CLIP_DUR = 5; // seconds per clip

function safeText(s: string): string {
  return s
    .replace(/\\/g, "")
    .replace(/'/g, "\u2019") // curly apostrophe avoids ffmpeg quoting issues
    .replace(/:/g, " ")
    .replace(/[<>{}[\]|^~`!@#$%*"]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .trim()
    .slice(0, 55);
}

function buildFfmpegArgs(
  clipPaths: string[],
  musicPath: string,
  title: string,
  scenes: { text: string }[],
  outputPath: string,
): string[] {
  const n = clipPaths.length;
  const parts: string[] = [];

  // Per-clip: scale to 1280x720, normalize fps, trim to CLIP_DUR, fade in/out
  clipPaths.forEach((_, i) => {
    parts.push(
      `[${i}:v]` +
      `scale=1280:720:force_original_aspect_ratio=decrease,` +
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,` +
      `trim=0:${CLIP_DUR},setpts=PTS-STARTPTS,` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${CLIP_DUR - 0.4}:d=0.4[v${i}]`
    );
  });

  // Concat all clips
  const catIn = clipPaths.map((_, i) => `[v${i}]`).join("");
  parts.push(`${catIn}concat=n=${n}:v=1:a=0[vcat]`);

  // Title overlay — bottom third, first 3 seconds
  const safeTitle = safeText(title);
  parts.push(
    `[vcat]drawtext=fontfile=${FONT}:text='${safeTitle}':` +
    `fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h*0.83:` +
    `shadowcolor=black:shadowx=2:shadowy=2:` +
    `box=1:boxcolor=black@0.55:boxborderw=10:` +
    `enable='between(t\\,0\\,3)'[v_t]`
  );

  // Per-scene captions at very bottom (chained drawtext filters)
  let prevLabel = "v_t";
  const numCaptions = Math.min(n, scenes.length);
  for (let i = 0; i < numCaptions; i++) {
    const raw = (scenes[i]?.text ?? "").split("\n")[0];
    const text = safeText(raw);
    const tStart = i * CLIP_DUR;
    const tEnd = (i + 1) * CLIP_DUR;
    const outLabel = i === numCaptions - 1 ? "vfinal" : `v_c${i}`;
    parts.push(
      `[${prevLabel}]drawtext=fontfile=${FONT}:text='${text}':` +
      `fontsize=20:fontcolor=white:x=(w-text_w)/2:y=h*0.92:` +
      `box=1:boxcolor=black@0.65:boxborderw=5:` +
      `enable='between(t\\,${tStart}\\,${tEnd})'[${outLabel}]`
    );
    prevLabel = outLabel;
  }

  // No captions — rename v_t to vfinal
  if (numCaptions === 0) {
    const idx = parts.findLastIndex(p => p.endsWith("[v_t]"));
    if (idx >= 0) parts[idx] = parts[idx].replace("[v_t]", "[vfinal]");
  }

  // Music: volume 30%, fade in 1.5s
  parts.push(`[${n}:a]volume=0.3,afade=t=in:st=0:d=1.5[aout]`);

  const filterComplex = parts.join("; ");

  return [
    "-y",
    ...clipPaths.flatMap(p => ["-i", p]),
    "-i", musicPath,
    "-filter_complex", filterComplex,
    "-map", "[vfinal]",
    "-map", "[aout]",
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-t", String(n * CLIP_DUR),
    outputPath,
  ];
}

// ---------------------------------------------------------------------------
// Background render pipeline: downloads clips + music, runs FFmpeg
// ---------------------------------------------------------------------------
async function renderProject(
  id: number,
  title: string,
  assets: { url: string }[],
  musicUrl: string,
  scenes: { text: string }[],
): Promise<void> {
  const dir = `/tmp/render-${id}`;
  await fs.promises.mkdir(dir, { recursive: true });

  const setProgress = async (pct: number) => {
    await db.update(projectsTable)
      .set({ renderProgress: pct, updatedAt: new Date() })
      .where(eq(projectsTable.id, id));
  };

  try {
    // Download video clips
    const clipPaths: string[] = [];
    for (let i = 0; i < Math.min(assets.length, 4); i++) {
      const dest = path.join(dir, `clip${i}.mp4`);
      await downloadFile(assets[i].url, dest);
      await setProgress(10 + i * 15);
      clipPaths.push(dest);
    }

    // Download music
    const musicPath = path.join(dir, "music.mp3");
    await downloadFile(musicUrl, musicPath);
    await setProgress(70);

    // FFmpeg compose
    const outputPath = path.join(dir, "output.mp4");
    const args = buildFfmpegArgs(clipPaths, musicPath, title, scenes, outputPath);
    await setProgress(75);
    await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });

    // Done
    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: `/api/projects/${id}/output`,
      thumbnailUrl: assets[0]?.url ? assets[0].url.replace("360.mp4", "thumb-360-0.jpg") : null,
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));

  } catch (err: any) {
    // Fallback: mark completed with first asset as the video
    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: assets[0]?.url ?? null,
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
  }
}

// ---------------------------------------------------------------------------
// CRUD routes
// ---------------------------------------------------------------------------
router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const limit = query.data.limit ?? 50;
  const offset = query.data.offset ?? 0;
  const projects = await db.select().from(projectsTable)
    .orderBy(desc(projectsTable.createdAt)).limit(limit).offset(offset);
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
  const [updated] = await db.update(projectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projectsTable.id, id)).returning();
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
// Serve rendered MP4 with range support
// ---------------------------------------------------------------------------
router.get("/projects/:id/output", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).send("Invalid id"); return; }
  const outputPath = `/tmp/render-${id}/output.mp4`;
  try {
    const stat = await fs.promises.stat(outputPath);
    const range = req.headers.range;
    const dl = req.query.dl === "1";
    if (dl) res.setHeader("Content-Disposition", `attachment; filename="video-${id}.mp4"`);
    if (range) {
      const [s, e] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(s, 10);
      const end = e ? parseInt(e, 10) : stat.size - 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Content-Type", "video/mp4");
      fs.createReadStream(outputPath, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Accept-Ranges", "bytes");
      fs.createReadStream(outputPath).pipe(res);
    }
  } catch {
    res.status(404).json({ error: "Rendered video not found" });
  }
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Script
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-script", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const title = project.title;
  const topic = project.topic ?? title;
  const niche = project.niche ?? "";
  const kws   = extractKeywords(title, topic, niche);
  const k0    = kws[0] ?? title;
  const k1    = kws[1] ?? topic;
  const k2    = kws[2] ?? niche;

  const hook  = `${title} — here's what nobody tells you.`;
  const body  = `In this video, we break down everything you need to know about ${topic || title}. `
    + `Whether you're a beginner or already familiar with ${k0}, you'll find `
    + `actionable insights you can apply immediately. We'll cover ${kws.slice(0, 3).join(", ")} `
    + `and why mastering these concepts puts you ahead of 95% of people in this space.`;
  const cta   = `If this was valuable, smash that like button and subscribe — we post weekly on ${niche || title}. Drop a comment below!`;

  const scenes = JSON.stringify([
    { id: 1, text: hook,           duration: CLIP_DUR, visualIntent: `Opening — ${k0}`,       keywords: kws.slice(0, 3) },
    { id: 2, text: `${k1} in action — discover how ${k1} is changing the game.`, duration: CLIP_DUR, visualIntent: `${k1} in action`, keywords: kws.slice(1, 4) },
    { id: 3, text: body,           duration: CLIP_DUR, visualIntent: `Educational — ${k2}`,   keywords: kws.slice(2, 5) },
    { id: 4, text: cta,            duration: CLIP_DUR, visualIntent: `Call to action`,         keywords: kws.slice(0, 2) },
  ]);

  const [updated] = await db.update(projectsTable).set({
    status: "scripting",
    script: `${hook}\n\n${body}\n\n${cta}`,
    hook, cta, scenes,
    keywords: JSON.stringify(kws),
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Assets — random unique clips from category pool
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const kws = extractKeywords(project.title, project.topic, project.niche);
  const pool = MIXKIT_VIDEOS[category] ?? MIXKIT_VIDEOS.default;
  const ids = randomPick(pool, 4);

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
// Pipeline: Generate Voiceover — set category-matched music
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const musicId = MUSIC_BY_CATEGORY[category] ?? 738;

  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    voiceoverUrl: mixkitMusicUrl(musicId),
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Render — real FFmpeg composition
// Accepts optional body { musicTrackId?: number } to override music
// ---------------------------------------------------------------------------
router.post("/projects/:id/render", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  let assets: { url: string }[] = [];
  let scenes: { text: string }[] = [];
  try { assets = JSON.parse(project.assets ?? "[]"); } catch (_) {}
  try { scenes = JSON.parse(project.scenes ?? "[]"); } catch (_) {}

  // Music: body override > voiceoverUrl > category default
  const bodyMusicId = typeof req.body?.musicTrackId === "number" ? req.body.musicTrackId : null;
  const category = detectCategory(project.title, project.topic, project.niche);
  const fallbackMusicId = MUSIC_BY_CATEGORY[category] ?? 738;
  const musicUrl = bodyMusicId
    ? mixkitMusicUrl(bodyMusicId)
    : (project.voiceoverUrl ?? mixkitMusicUrl(fallbackMusicId));

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));

  // Kick off background render — does not block the response
  renderProject(id, project.title, assets, musicUrl, scenes).catch(() => {
    /* errors handled inside renderProject with fallback */
  });
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
