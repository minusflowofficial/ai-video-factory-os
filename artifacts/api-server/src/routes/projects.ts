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
import { searchMixkitVideos, searchMixkitMusic } from "../mixkit-search";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FONT     = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const XFADE_DUR = 0.5;

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------
/** Parse "30s", "60s", "3m", "5min" → seconds */
function parseDuration(dur: string): number {
  if (!dur) return 60;
  const m = dur.trim().match(/^(\d+(?:\.\d+)?)\s*(m(?:in)?|s(?:ec)?)?$/i);
  if (!m) return 60;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  return unit.startsWith("m") ? Math.round(n * 60) : Math.round(n);
}

/** Choose number of clips and per-clip duration based on total video length */
function getClipConfig(secs: number): { numClips: number; clipDur: number } {
  if (secs <= 15)  return { numClips: 2, clipDur: secs / 2 };
  if (secs <= 40)  return { numClips: 3, clipDur: secs / 3 };
  if (secs <= 90)  return { numClips: 4, clipDur: secs / 4 };
  if (secs <= 180) return { numClips: 5, clipDur: secs / 5 };
  if (secs <= 300) return { numClips: 6, clipDur: secs / 6 };
  return { numClips: 8, clipDur: secs / 8 };
}


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
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string {
  const clean = text
    .replace(/[^\x00-\x7F]/g, "")
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
  showTitle:        boolean;
  showCaptions:     boolean;
  transitionEffect: "fade" | "xfade" | "zoom";
  addSfx:           boolean;
  musicTrackId?:    number;
  aspectRatio?:     string; // "16:9" | "9:16" | "1:1"
  clipDur?:         number; // per-clip duration in seconds
}

// ---------------------------------------------------------------------------
// FFmpeg filter_complex builder
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
  const AR       = opts.aspectRatio ?? "16:9";
  const clipDur  = opts.clipDur     ?? 5;

  // Output dimensions based on aspect ratio
  const W = AR === "9:16" ? 720  : AR === "1:1" ? 720  : 1280;
  const H = AR === "9:16" ? 1280 : AR === "1:1" ? 720  : 720;

  const parts: string[] = [];

  // ── Synthetic SFX (whoosh at each transition) ────────────────────────────
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
      sfxPath = null;
    }
  }

  // ── Per-clip scale filter (handles all aspect ratios) ────────────────────
  // For 9:16 and 1:1: scale landscape to fill the HEIGHT, then center-crop the width
  // For 16:9: scale to fit width, letterbox if needed
  function clipScaleFilter(i: number): string {
    if (AR === "9:16" || AR === "1:1") {
      // scale to fill height → width may exceed target → crop center
      return (
        `[${i}:v]scale=-2:${H},crop=${W}:${H}:(iw-${W})/2:0,` +
        `setsar=1,fps=24,trim=0:${clipDur},setpts=PTS-STARTPTS`
      );
    }
    // 16:9 default: fit with black bars if needed
    return (
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,` +
      `trim=0:${clipDur},setpts=PTS-STARTPTS`
    );
  }

  // ── Per-clip video filter ────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const base = clipScaleFilter(i);

    if (transitionEffect === "zoom") {
      const zExpr = i % 2 === 0
        ? `min(1.0+0.003*on,1.3)`
        : `max(1.3-0.003*on,1.0)`;
      const fadeIn  = `,fade=t=in:st=0:d=0.4`;
      const fadeOut = `,fade=t=out:st=${(clipDur - 0.4).toFixed(2)}:d=0.4`;
      parts.push(
        `${base},` +
        `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=24:s=${W}x${H}` +
        `${fadeIn}${fadeOut}[v${i}]`
      );
    } else if (transitionEffect === "xfade") {
      const fi = i === 0           ? `,fade=t=in:st=0:d=0.4` : "";
      const fo = i === n - 1       ? `,fade=t=out:st=${(clipDur - 0.4).toFixed(2)}:d=0.4` : "";
      parts.push(`${base}${fi}${fo}[v${i}]`);
    } else {
      // Simple fade in/out on every clip
      parts.push(
        `${base},fade=t=in:st=0:d=0.4,` +
        `fade=t=out:st=${(clipDur - 0.4).toFixed(2)}:d=0.4[v${i}]`
      );
    }
  }

  // ── Video concatenation / xfade transitions ───────────────────────────────
  let finalVideoLabel: string;

  if (transitionEffect === "xfade" && n > 1) {
    let xprev = "v0";
    for (let i = 1; i < n; i++) {
      const offset = +((i) * (clipDur - XFADE_DUR)).toFixed(3);
      const out    = i === n - 1 ? "vcat" : `x${i}`;
      parts.push(`[${xprev}][v${i}]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset}[${out}]`);
      xprev = out;
    }
    finalVideoLabel = "vcat";
  } else if (n === 1) {
    finalVideoLabel = "v0";
  } else {
    const catIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
    parts.push(`${catIn}concat=n=${n}:v=1:a=0[vcat]`);
    finalVideoLabel = "vcat";
  }

  // ── Text overlays ─────────────────────────────────────────────────────────
  let prev = finalVideoLabel;

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
      const raw     = (scenes[i]?.text ?? "").split("\n")[0];
      const capText = wrapText(raw, 38, 2);
      if (!capText) continue;
      const capFile = path.join(dir, `cap${i}.txt`);
      await fs.promises.writeFile(capFile, capText, "utf8");
      const tStart = +(i * clipDur).toFixed(3);
      const tEnd   = +((i + 1) * clipDur - 0.2).toFixed(3);
      const out    = `v_c${i}`;
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

  // ── Audio mix ─────────────────────────────────────────────────────────────
  const musicIdx = n;
  const totalDur = transitionEffect === "xfade" && n > 1
    ? +(n * clipDur - (n - 1) * XFADE_DUR).toFixed(3)
    : n * clipDur;

  if (sfxPath && n > 1) {
    const sfxIdx   = n + 1;
    const nTrans   = n - 1;
    parts.push(`[${musicIdx}:a]volume=0.6,afade=t=in:st=0:d=1.5,afade=t=out:st=${totalDur - 2}:d=2[aout_m]`);
    const splitOut = Array.from({ length: nTrans }, (_, i) => `[sfxr${i}]`).join("");
    parts.push(`[${sfxIdx}:a]asplit=${nTrans}${splitOut}`);
    for (let i = 0; i < nTrans; i++) {
      const transTime = transitionEffect === "xfade"
        ? (i + 1) * (clipDur - XFADE_DUR)
        : (i + 1) * clipDur;
      const delayMs = Math.round(transTime * 1000);
      parts.push(`[sfxr${i}]volume=0.7,adelay=${delayMs}|${delayMs}[sfxd${i}]`);
    }
    if (nTrans === 1) {
      parts.push(`[sfxd0]acopy[sfx_m]`);
    } else {
      const sfxIn = Array.from({ length: nTrans }, (_, i) => `[sfxd${i}]`).join("");
      parts.push(`${sfxIn}amix=inputs=${nTrans}:duration=longest[sfx_norm]`);
      parts.push(`[sfx_norm]volume=${nTrans}[sfx_m]`);
    }
    parts.push(`[aout_m][sfx_m]amix=inputs=2:duration=first[aout]`);
  } else {
    parts.push(
      `[${musicIdx}:a]volume=0.3,` +
      `afade=t=in:st=0:d=1.5,` +
      `afade=t=out:st=${Math.max(totalDur - 2, 0).toFixed(3)}:d=2` +
      `[aout]`
    );
  }

  // ── Assemble inputs with stream_loop so short clips fill clipDur ──────────
  const inputArgs: string[] = [];
  for (const p of clipPaths) {
    inputArgs.push("-stream_loop", "-1", "-i", p);
  }
  inputArgs.push("-i", musicPath);
  if (sfxPath) inputArgs.push("-i", sfxPath);

  return [
    "-y",
    ...inputArgs,
    "-filter_complex", parts.join("; "),
    "-map",   `[${prev}]`,
    "-map",   "[aout]",
    "-c:v",   "libx264", "-preset", "fast", "-crf", "23",
    "-c:a",   "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-t",     String(totalDur),
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
    // Download video clips with stream_loop support
    const clipPaths: string[] = [];
    const numClips = Math.min(assets.length, 8);
    for (let i = 0; i < numClips; i++) {
      const dest = path.join(dir, `clip${i}.mp4`);
      await downloadFile(assets[i].url, dest);
      await setProgress(10 + Math.floor((i / numClips) * 55));
      clipPaths.push(dest);
    }

    // Download music
    const musicPath = path.join(dir, "music.mp3");
    await downloadFile(musicUrl, musicPath);
    await setProgress(68);

    const outputPath = path.join(dir, "output.mp4");
    await setProgress(72);

    const args = await buildFfmpegArgs(clipPaths, musicPath, title, scenes, outputPath, dir, opts);

    // Run FFmpeg — any failure will throw (stderr included in error.message)
    await setProgress(75);
    await execFileAsync("ffmpeg", args, { maxBuffer: 128 * 1024 * 1024 });

    await db.update(projectsTable).set({
      status: "completed",
      renderProgress: 100,
      videoUrl: `/api/projects/${id}/output`,
      thumbnailUrl: assets[0]?.url.replace("360.mp4", "thumb-360-0.jpg") ?? null,
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));

  } catch (err: any) {
    // Log the real error so it shows up in server logs
    const stderr = err?.stderr ?? err?.message ?? String(err);
    console.error(`[render-${id}] FFmpeg failed:\n${stderr}`);

    await db.update(projectsTable).set({
      status: "error" as any,
      renderProgress: 0,
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
// Builds scenes proportional to video duration. No forced CTA.
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

  // Calculate how many scenes we need based on video duration
  const totalSecs = parseDuration(project.duration ?? "60s");
  const { numClips, clipDur } = getClipConfig(totalSecs);

  // Build scene texts proportional to clip count
  const k = (i: number) => kws[i] ?? kws[0] ?? title;

  const sceneTexts: string[] = [];

  // Always: hook as scene 1
  sceneTexts.push(`${title} — here's what nobody tells you.`);

  if (numClips === 2) {
    sceneTexts.push(
      `Dive deep into ${topic || title}. Master ${k(0)} and ${k(1)} to stay ahead.`
    );
  } else if (numClips === 3) {
    sceneTexts.push(`${k(1)} in action — discover how ${k(1)} is changing the game.`);
    sceneTexts.push(
      `Whether you're a beginner or advanced, mastering ${k(0)}, ${k(2)} and ` +
      `${k(3)} puts you ahead of 95% of people in this space.`
    );
  } else {
    // 4+ clips: build body scenes covering the topic in depth
    for (let i = 1; i < numClips; i++) {
      const kw = k(i);
      if (i === 1) {
        sceneTexts.push(`${kw} in action — discover how ${kw} is reshaping ${topic || title}.`);
      } else if (i === numClips - 1) {
        // Last scene: strong summary, NO forced CTA
        sceneTexts.push(
          `Master ${kws.slice(0, 3).join(", ")} and you'll unlock results ` +
          `most people in ${niche || "this space"} never achieve.`
        );
      } else {
        sceneTexts.push(
          `Deep dive into ${kw}: the tactics, frameworks and insights ` +
          `behind every successful ${topic || title} strategy.`
        );
      }
    }
  }

  const scenes = sceneTexts.map((text, i) => ({
    id: i + 1,
    text,
    duration: Math.round(clipDur),
    visualIntent: i === 0 ? `Opening — ${k(0)}` : `Scene ${i + 1} — ${k(i)}`,
    keywords: kws.slice(i, i + 3),
  }));

  const scriptBody = sceneTexts.join("\n\n");

  const [updated] = await db.update(projectsTable).set({
    status: "scripting",
    script: scriptBody,
    hook:   sceneTexts[0],
    cta:    null,                       // no forced CTA
    scenes: JSON.stringify(scenes),
    keywords: JSON.stringify(kws),
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Assets
// Dynamically searches Mixkit by keyword, verifies clips are accessible
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-assets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  // Respond immediately with "fetching-assets" so UI shows progress
  const [interim] = await db.update(projectsTable).set({
    status: "fetching-assets",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(interim));

  // Run asset search in background — async so response is already sent
  (async () => {
    try {
      const totalSecs = parseDuration(project.duration ?? "60s");
      const { numClips } = getClipConfig(totalSecs);

      // Build keyword list from topic, niche, title — most specific first
      const kws = extractKeywords(project.title, project.topic, project.niche);
      // Also add raw topic/niche slugs as top-priority search terms
      const searchTerms = [
        project.topic ?? "",
        project.niche ?? "",
        ...kws,
      ].map(s => s.trim()).filter(Boolean);

      // Dynamic search — scrapes Mixkit pages for real keyword-matched clips
      const ids = await searchMixkitVideos(searchTerms, numClips);

      const assets = JSON.stringify(ids.map((mixkitId, i) => ({
        id: i + 1, type: "video", mixkitId,
        url: mixkitVideoUrl(mixkitId),
        thumbnail: mixkitThumbUrl(mixkitId),
        source: "mixkit",
        keyword: searchTerms[i] ?? searchTerms[0] ?? project.title,
      })));

      await db.update(projectsTable).set({
        assets,
        updatedAt: new Date(),
      }).where(eq(projectsTable.id, id));
    } catch (err) {
      console.error(`[generate-assets] project ${id} failed:`, err);
    }
  })();
});

// ---------------------------------------------------------------------------
// Pipeline: Generate Voiceover
// Dynamically searches Mixkit music by keyword, picks a matching track
// ---------------------------------------------------------------------------
router.post("/projects/:id/generate-voiceover", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  // Respond immediately
  const [interim] = await db.update(projectsTable).set({
    status: "voiceover",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();
  res.json(serializeProject(interim));

  // Search for matching music in background
  (async () => {
    try {
      const kws = extractKeywords(project.title, project.topic, project.niche);
      const searchTerms = [
        project.topic ?? "",
        project.niche ?? "",
        ...kws,
      ].map(s => s.trim()).filter(Boolean);

      const musicUrl = await searchMixkitMusic(searchTerms);

      await db.update(projectsTable).set({
        voiceoverUrl: musicUrl,
        updatedAt: new Date(),
      }).where(eq(projectsTable.id, id));
    } catch (err) {
      console.error(`[generate-voiceover] project ${id} failed:`, err);
    }
  })();
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

  if (assets.length === 0) {
    res.status(400).json({ error: "No assets available. Run generate-assets first." });
    return;
  }

  // Resolve music URL — use explicit trackId, then project's searched music, then default fallback
  const bodyMusicId = typeof req.body?.musicTrackId === "number" ? req.body.musicTrackId : null;
  const musicUrl    = bodyMusicId
    ? mixkitMusicUrl(bodyMusicId)
    : (project.voiceoverUrl ?? "https://assets.mixkit.co/music/872/872.mp3");

  // Duration-based clip timing
  const totalSecs = parseDuration(project.duration ?? "60s");
  const { numClips, clipDur } = getClipConfig(totalSecs);
  const clipsToUse = Math.min(assets.length, numClips);

  const opts: RenderOptions = {
    showTitle:        req.body?.showTitle        === true,
    showCaptions:     req.body?.showCaptions     === true,
    transitionEffect: ["fade","xfade","zoom"].includes(req.body?.transitionEffect)
      ? req.body.transitionEffect : "xfade",
    addSfx:           req.body?.addSfx           === true,
    musicTrackId:     bodyMusicId ?? undefined,
    aspectRatio:      project.aspectRatio ?? "16:9",
    clipDur,
  };

  const [updated] = await db.update(projectsTable).set({
    status: "rendering",
    renderProgress: 0,
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeProject(updated));

  // Background FFmpeg render — errors are logged and stored as status "error"
  renderProject(id, project.title, assets.slice(0, clipsToUse), musicUrl, scenes, opts)
    .catch(() => {});
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
