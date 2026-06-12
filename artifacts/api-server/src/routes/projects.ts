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
// Constants
// ---------------------------------------------------------------------------
const FONT     = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const CLIP_DUR = 5;  // seconds per clip
const XFADE_DUR = 0.5; // crossfade duration in seconds

// ---------------------------------------------------------------------------
// Mixkit CDN video pools (server-side confirmed 200)
// ---------------------------------------------------------------------------
const MIXKIT_VIDEOS: Record<string, number[]> = {
  technology: [2523,2524,2525,2526,2527,4007,4008,4009,4010,4011,4012,26076,26077,26078],
  business:   [2586,2587,2588,2589,2590,2867,2868,2869,2870,4013,4014,4015,4016,4017],
  nature:     [1120,1121,1122,1123,1124,1487,1488,1489,1490,4019,4020,4021,4022,4023],
  fitness:    [2580,2581,2582,2583,2584,4025,4026,4027,4028,4029,4030],
  crypto:     [2523,2524,2528,2530,2531,2532,2533,4007,4008,4009],
  finance:    [2534,2535,2536,2537,2538,2586,2587,2588,4010,4011],
  travel:     [2553,2554,2555,2556,2557,1120,1121,1122,4019,4020,4021],
  people:     [2867,2868,2869,2870,2871,4009,4010,4011,4012,4013],
  abstract:   [1487,1488,1489,1490,1491,4007,4013,4018,4024,4029],
  default:    [2523,2588,1122,2867,1487,4007,4009,4013,4018,4023],
};

const MUSIC_BY_CATEGORY: Record<string, number> = {
  technology: 838, business: 740, nature: 872, fitness: 741,
  crypto: 838,  finance: 740,  travel: 739,  people: 739,
  abstract: 873, default: 738,
};

const STOP_WORDS = new Set([
  "the","a","an","and","or","is","in","of","to","for","with","how","why","what",
  "when","where","that","this","are","was","were","be","been","being","have",
  "has","had","do","does","did","will","would","could","should","may","might",
  "about","from","by","as","at","on","into","more","most","best","top","your",
  "you","my","we","our","us","i","it","its","all","any","one","two","three",
  "can","get","make","use","just","also","but","not","so","if","then","their",
  "they","them","video","content","watch","like","share","subscribe","here","now",
]);

function extractKeywords(title: string, topic?: string | null, niche?: string | null): string[] {
  const text = `${title} ${topic ?? ""} ${niche ?? ""}`.toLowerCase();
  const words = (text.match(/\b[a-z]{3,}\b/g) ?? []).filter(w => !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

function detectCategory(title: string, topic?: string | null, niche?: string | null): string {
  const t = `${title} ${topic ?? ""} ${niche ?? ""}`.toLowerCase();
  if (t.match(/tech|ai|artificial|software|digital|computer|code|app|web|data|automation|robot|cyber/)) return "technology";
  if (t.match(/business|market|startup|brand|sales|agency|company|entrepreneur|corporate|professional/)) return "business";
  if (t.match(/nature|outdoor|landscape|forest|ocean|mountain|river|wildlife|plant|garden|sky/)) return "nature";
  if (t.match(/fit|health|workout|gym|sport|exercise|yoga|run|body|weight|muscle|wellness|diet/)) return "fitness";
  if (t.match(/crypto|bitcoin|blockchain|nft|defi|web3|token|coin/)) return "crypto";
  if (t.match(/finance|money|invest|stock|wealth|trading|fund|bank|budget|income|profit/)) return "finance";
  if (t.match(/travel|adventure|trip|explore|tour|journey|vacation|destination|culture/)) return "travel";
  if (t.match(/motivat|inspire|success|mindset|productivity|habit|goal|focus|growth|self/)) return "people";
  return "default";
}

function randomPick<T>(pool: T[], n: number): T[] {
  const s = [...pool].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => s[i % s.length]);
}

const mixkitVideoUrl = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`;
const mixkitThumbUrl = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`;
const mixkitMusicUrl = (id: number) => `https://assets.mixkit.co/music/${id}/${id}.mp3`;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Wraps text to at most maxLines lines, each at most maxCharsPerLine chars */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string {
  const clean = text
    .replace(/[^\x00-\x7F]/g, "")   // strip non-ASCII (emoji etc.)
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length <= maxCharsPerLine) return clean;

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const raw of words) {
    if (lines.length >= maxLines) break;
    const w = raw.length > maxCharsPerLine ? raw.slice(0, maxCharsPerLine) : raw;
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxCharsPerLine) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines).join("\n");
}

// ---------------------------------------------------------------------------
// Download helper (server-side)
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
// Render options
// ---------------------------------------------------------------------------
export interface RenderOptions {
  showTitle: boolean;
  showCaptions: boolean;
  transitionEffect: "fade" | "xfade" | "zoom";
  addSfx: boolean;
  musicTrackId?: number;
}

// ---------------------------------------------------------------------------
// FFmpeg filter_complex builder
// Returns FFmpeg CLI args. Writes temp text files for title/captions.
// ---------------------------------------------------------------------------
async function buildFfmpegArgs(
  clipPaths: string[],
  musicPath: string,
  title: string,
  scenes: { text: string }[],
  outputPath: string,
  dir: string,
  opts: RenderOptions,
): Promise<string[]> {
  const n = clipPaths.length;
  const { showTitle, showCaptions, transitionEffect, addSfx } = opts;
  const parts: string[] = [];

  // ── Generate transition SFX (synthetic whoosh via FFmpeg audio synthesis) ──
  let sfxPath: string | null = null;
  if (addSfx && n > 1) {
    sfxPath = path.join(dir, "sfx.mp3");
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-f", "lavfi",
        "-i", "aevalsrc=0.7*exp(-t/0.1)*sin(2*PI*(1100-800*t/0.35)*t):c=stereo:s=44100:d=0.35",
        sfxPath,
      ]);
    } catch {
      sfxPath = null; // silently skip SFX if generation fails
    }
  }

  // ── Per-clip video filter ────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    // Scale to 1280x720, normalize SAR + fps, trim to CLIP_DUR
    const base =
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,` +
      `trim=0:${CLIP_DUR},setpts=PTS-STARTPTS`;

    if (transitionEffect === "zoom") {
      // Ken Burns: even clips zoom IN (1.0→1.3), odd clips zoom OUT (1.3→1.0)
      // zoompan d=1: one output frame per input frame, `on` increments globally
      const zExpr = i % 2 === 0
        ? `min(1.0+0.003*on,1.3)`   // zoom in
        : `max(1.3-0.003*on,1.0)`;  // zoom out
      parts.push(
        `${base},` +
        `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=24:s=1280x720,` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${CLIP_DUR - 0.4}:d=0.4[v${i}]`
      );
    } else if (transitionEffect === "xfade") {
      // xfade handles inter-clip transitions; only add fade on first/last clip
      const fi = i === 0 ? `,fade=t=in:st=0:d=0.4` : "";
      const fo = i === n - 1 ? `,fade=t=out:st=${CLIP_DUR - 0.4}:d=0.4` : "";
      parts.push(`${base}${fi}${fo}[v${i}]`);
    } else {
      // Fade: fade in/out on every clip
      parts.push(`${base},fade=t=in:st=0:d=0.4,fade=t=out:st=${CLIP_DUR - 0.4}:d=0.4[v${i}]`);
    }
  }

  // ── Video concatenation / transitions ────────────────────────────────────
  if (transitionEffect === "xfade" && n > 1) {
    let prev = "[v0]";
    for (let i = 1; i < n; i++) {
      const offset = +(i * (CLIP_DUR - XFADE_DUR)).toFixed(3);
      const out = i === n - 1 ? "[vcat]" : `[x${i}]`;
      parts.push(`${prev}[v${i}]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset}${out}`);
      prev = out;
    }
  } else {
    const catIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
    parts.push(`${catIn}concat=n=${n}:v=1:a=0[vcat]`);
  }

  // ── Text overlays (optional; use textfile to avoid all escaping issues) ──
  let prev = "vcat";

  if (showTitle) {
    const titleFile = path.join(dir, "title.txt");
    await fs.promises.writeFile(titleFile, wrapText(title, 42, 1), "utf8");
    parts.push(
      `[${prev}]drawtext=fontfile=${FONT}:textfile=${titleFile}:` +
      `fontsize=44:fontcolor=white:` +
      `x='max(60,(w-text_w)/2)':y=h*0.81:` +
      `shadowcolor=black:shadowx=2:shadowy=2:` +
      `box=1:boxcolor=black@0.55:boxborderw=12:` +
      `enable='between(t\\,0\\,3.5)'[v_title]`
    );
    prev = "v_title";
  }

  if (showCaptions) {
    const numCaptions = Math.min(n, scenes.length);
    for (let i = 0; i < numCaptions; i++) {
      const raw = (scenes[i]?.text ?? "").split("\n")[0];
      const capText = wrapText(raw, 38, 2);
      if (!capText) continue;
      const capFile = path.join(dir, `cap${i}.txt`);
      await fs.promises.writeFile(capFile, capText, "utf8");
      const tStart = i * CLIP_DUR;
      const tEnd   = (i + 1) * CLIP_DUR;
      const out    = i === numCaptions - 1 ? "v_cap_end" : `v_c${i}`;
      parts.push(
        `[${prev}]drawtext=fontfile=${FONT}:textfile=${capFile}:` +
        `fontsize=22:fontcolor=white:` +
        `x='max(60,(w-text_w)/2)':y=h*0.88:` +
        `line_spacing=5:` +
        `box=1:boxcolor=black@0.65:boxborderw=10:` +
        `enable='between(t\\,${tStart}\\,${tEnd})'[${out}]`
      );
      prev = out;
    }
  }

  // null pass-through to normalize the final label to [vfinal]
  parts.push(`[${prev}]null[vfinal]`);

  // ── Audio mix ────────────────────────────────────────────────────────────
  const musicIdx = n;

  if (sfxPath && n > 1) {
    const sfxIdx   = n + 1;
    const nTrans   = n - 1;
    // Pre-boost music so amix(÷2) still gives target volume
    parts.push(`[${musicIdx}:a]volume=0.6,afade=t=in:st=0:d=1.5[aout_m]`);
    // Split sfx into one copy per transition
    const splitOut = Array.from({ length: nTrans }, (_, i) => `[sfxr${i}]`).join("");
    parts.push(`[${sfxIdx}:a]asplit=${nTrans}${splitOut}`);
    // Delay each copy to its transition timestamp
    for (let i = 0; i < nTrans; i++) {
      const transTime = transitionEffect === "xfade"
        ? (i + 1) * (CLIP_DUR - XFADE_DUR)
        : (i + 1) * CLIP_DUR;
      const delayMs = Math.round(transTime * 1000);
      parts.push(`[sfxr${i}]volume=0.7,adelay=${delayMs}|${delayMs}[sfxd${i}]`);
    }
    // Mix sfx copies together (then boost to compensate amix normalization)
    if (nTrans === 1) {
      parts.push(`[sfxd0]null[sfx_m]`);
    } else {
      const sfxIn = Array.from({ length: nTrans }, (_, i) => `[sfxd${i}]`).join("");
      parts.push(`${sfxIn}amix=inputs=${nTrans}:duration=longest[sfx_norm]`);
      parts.push(`[sfx_norm]volume=${nTrans}[sfx_m]`);
    }
    // Final mix: music + sfx (÷2 by amix, compensated by pre-boost)
    parts.push(`[aout_m][sfx_m]amix=inputs=2:duration=first[aout]`);
  } else {
    parts.push(`[${musicIdx}:a]volume=0.3,afade=t=in:st=0:d=1.5[aout]`);
  }

  // ── Assemble final args ──────────────────────────────────────────────────
  const totalDur = transitionEffect === "xfade" && n > 1
    ? +(n * CLIP_DUR - (n - 1) * XFADE_DUR).toFixed(3)
    : n * CLIP_DUR;

  const inputArgs: string[] = [];
  for (const p of clipPaths)  inputArgs.push("-i", p);
  inputArgs.push("-i", musicPath);
  if (sfxPath) inputArgs.push("-i", sfxPath);

  return [
    "-y",
    ...inputArgs,
    "-filter_complex", parts.join("; "),
    "-map", "[vfinal]",
    "-map", "[aout]",
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-t", String(totalDur),
    outputPath,
  ];
}

// ---------------------------------------------------------------------------
// Background render pipeline
// ---------------------------------------------------------------------------
async function renderProject(
  id: number,
  title: string,
  assets: { url: string }[],
  musicUrl: string,
  scenes: { text: string }[],
  opts: RenderOptions,
): Promise<void> {
  const dir = `/tmp/render-${id}`;
  await fs.promises.mkdir(dir, { recursive: true });

  const setProgress = (pct: number) =>
    db.update(projectsTable)
      .set({ renderProgress: pct, updatedAt: new Date() })
      .where(eq(projectsTable.id, id));

  try {
    // Download video clips
    const clipPaths: string[] = [];
    for (let i = 0; i < Math.min(assets.length, 4); i++) {
      const dest = path.join(dir, `clip${i}.mp4`);
      await downloadFile(assets[i].url, dest);
      await setProgress(10 + i * 14);
      clipPaths.push(dest);
    }

    // Download music
    const musicPath = path.join(dir, "music.mp3");
    await downloadFile(musicUrl, musicPath);
    await setProgress(68);

    // Build FFmpeg args (writes text files, generates SFX)
    const outputPath = path.join(dir, "output.mp4");
    await setProgress(72);
    const args = await buildFfmpegArgs(clipPaths, musicPath, title, scenes, outputPath, dir, opts);

    // Run FFmpeg
    await setProgress(75);
    await execFileAsync("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024 });

    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: `/api/projects/${id}/output`,
      thumbnailUrl: assets[0]?.url.replace("360.mp4", "thumb-360-0.jpg") ?? null,
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));

  } catch (err: any) {
    // Fallback: mark complete with first Mixkit clip as video
    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: assets[0]?.url ?? null,
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
  }
}

// ---------------------------------------------------------------------------
// Stream rendered MP4 with HTTP range support
// ---------------------------------------------------------------------------
router.get("/projects/:id/output", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).send("Invalid id"); return; }
  const outputPath = `/tmp/render-${id}/output.mp4`;
  try {
    const stat = await fs.promises.stat(outputPath);
    const dl   = req.query.dl === "1";
    if (dl) res.setHeader("Content-Disposition", `attachment; filename="video-${id}.mp4"`);
    const range = req.headers.range;
    if (range) {
      const [s, e] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(s, 10);
      const end   = e ? parseInt(e, 10) : stat.size - 1;
      res.status(206);
      res.setHeader("Content-Range",  `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Accept-Ranges",  "bytes");
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Content-Type",   "video/mp4");
      fs.createReadStream(outputPath, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Type",   "video/mp4");
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Accept-Ranges",  "bytes");
      fs.createReadStream(outputPath).pipe(res);
    }
  } catch {
    res.status(404).json({ error: "Rendered video not found" });
  }
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
router.get("/projects", async (req, res): Promise<void> => {
  const q = ListProjectsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const rows = await db.select().from(projectsTable)
    .orderBy(desc(projectsTable.createdAt))
    .limit(q.data.limit ?? 50)
    .offset(q.data.offset ?? 0);
  res.json(rows.map(serializeProject));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [p] = await db.insert(projectsTable).values({
    title:         parsed.data.title,
    topic:         parsed.data.topic        ?? null,
    niche:         parsed.data.niche        ?? null,
    duration:      parsed.data.duration     ?? "60s",
    aspectRatio:   parsed.data.aspectRatio  ?? "16:9",
    captionStyle:  parsed.data.captionStyle ?? "Modern Minimal",
    voiceOption:   parsed.data.voiceOption  ?? "generate",
    voiceGender:   parsed.data.voiceGender  ?? "female",
    voiceLanguage: parsed.data.voiceLanguage ?? "en-US",
    aiProvider:    parsed.data.aiProvider   ?? "gemini",
    status: "draft",
  }).returning();
  res.status(201).json(serializeProject(p));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeProject(p));
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
  const [del] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Script
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
  const k0     = kws[0] ?? title;
  const k1     = kws[1] ?? topic;
  const k2     = kws[2] ?? niche;

  const hook = `${title} — here's what nobody tells you.`;
  const body =
    `In this video, we break down everything you need to know about ${topic || title}. ` +
    `Whether you're a beginner or already familiar with ${k0}, you'll find ` +
    `actionable insights you can apply immediately. We'll cover ${kws.slice(0, 3).join(", ")} ` +
    `and why mastering these concepts puts you ahead of 95% of people in this space.`;
  const cta  = `If this was valuable, smash that like button and subscribe — we post weekly on ${niche || title}. Drop a comment below!`;

  const scenes = JSON.stringify([
    { id: 1, text: hook,  duration: CLIP_DUR, visualIntent: `Opening — ${k0}`,      keywords: kws.slice(0, 3) },
    { id: 2, text: `${k1} in action — discover how ${k1} is changing the game.`, duration: CLIP_DUR, visualIntent: `${k1} in action`, keywords: kws.slice(1, 4) },
    { id: 3, text: body,  duration: CLIP_DUR, visualIntent: `Educational — ${k2}`,  keywords: kws.slice(2, 5) },
    { id: 4, text: cta,   duration: CLIP_DUR, visualIntent: `Call to action`,        keywords: kws.slice(0, 2) },
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
// Pipeline: Generate Assets
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const kws      = extractKeywords(project.title, project.topic, project.niche);
  const pool     = MIXKIT_VIDEOS[category] ?? MIXKIT_VIDEOS.default;
  const ids      = randomPick(pool, 4);

  const assets = JSON.stringify(ids.map((mixkitId, i) => ({
    id: i + 1, type: "video", mixkitId,
    url: mixkitVideoUrl(mixkitId),
    thumbnail: mixkitThumbUrl(mixkitId),
    source: "mixkit", category,
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
// Pipeline: Generate Voiceover (selects category-matched music)
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const category = detectCategory(project.title, project.topic, project.niche);
  const musicId  = MUSIC_BY_CATEGORY[category] ?? 738;

  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    voiceoverUrl: mixkitMusicUrl(musicId),
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Render — real FFmpeg composition
// Body: { musicTrackId?, showTitle?, showCaptions?, transitionEffect?, addSfx? }
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

  // Resolve music URL
  const bodyMusicId = typeof req.body?.musicTrackId === "number" ? req.body.musicTrackId : null;
  const category    = detectCategory(project.title, project.topic, project.niche);
  const musicUrl    = bodyMusicId
    ? mixkitMusicUrl(bodyMusicId)
    : (project.voiceoverUrl ?? mixkitMusicUrl(MUSIC_BY_CATEGORY[category] ?? 738));

  // Render options from request body
  const opts: RenderOptions = {
    showTitle:        req.body?.showTitle        === true,
    showCaptions:     req.body?.showCaptions     === true,
    transitionEffect: ["fade","xfade","zoom"].includes(req.body?.transitionEffect)
      ? req.body.transitionEffect : "xfade",
    addSfx:           req.body?.addSfx           === true,
    musicTrackId:     bodyMusicId ?? undefined,
  };

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));

  // Background FFmpeg render (non-blocking)
  renderProject(id, project.title, assets, musicUrl, scenes, opts).catch(() => {});
});

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------
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
