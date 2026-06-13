/**
 * Clipper pipeline
 *
 * POST /api/clipper/upload              — upload a local video file → { filePath }
 * POST /api/clipper/process             — start full pipeline (YouTube URL)
 * POST /api/clipper/process-local       — start pipeline from uploaded file
 * GET  /api/clipper/status/:jobId       — poll job progress + clip results
 * GET  /api/clipper/download/:token     — download a generated clip
 * GET  /api/clipper/preview/:token      — inline video preview
 * GET  /api/clipper/history             — list past sessions from DB
 * GET  /api/clipper/cookies-status      — check cookies.txt
 * POST /api/clipper/save-cookies        — save Netscape cookies content
 * GET  /api/pixabay/search              — search Pixabay for stock footage/images
 */

import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import multer from "multer";
import { db, clipperHistoryTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const PYTHON = process.env.PYTHON_PATH ?? "python3";
const CREATE_CLIP_SCRIPT = path.resolve("../../scripts/create_clip.py");
const COOKIES_PATH = path.resolve("../../.youtube-cookies.txt");

const CLIPPER_UPLOADS_DIR = "/tmp/clipper-uploads";
const CLIPPER_CHUNKS_DIR  = "/tmp/clipper-chunks";

// ── File upload (kept for very small files / backward compat) ─────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(CLIPPER_UPLOADS_DIR, { recursive: true });
    cb(null, CLIPPER_UPLOADS_DIR);
  },
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.mp4`),
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ── Chunked upload multer (max 8 MB per chunk) ────────────────────────────────
const chunkStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(CLIPPER_CHUNKS_DIR, req.body.fileId ?? "unknown");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, _file, cb) => cb(null, `chunk-${req.body.chunkIndex ?? 0}`),
});
const chunkUpload = multer({ storage: chunkStorage, limits: { fileSize: 8 * 1024 * 1024 } });

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClipResult {
  id: number; title: string; hook: string; hookType: string;
  viralScore: number; startTime: string; endTime: string; duration: string;
  status: "pending" | "processing" | "done" | "error";
  downloadToken?: string; sizeMb?: number; error?: string;
  suggestedTitle?: string; hashtags?: string[]; description?: string;
}
interface ClipJob {
  id: string;
  status: "queued" | "uploading" | "downloading" | "transcribing" | "analyzing" | "creating" | "done" | "error";
  stepLabel: string; progress: number;
  clips: ClipResult[]; totalClips: number; doneClips: number;
  videoTitle?: string; error?: string; createdAt: number; dir: string;
  // history metadata
  sourceType?: string; sourceUrl?: string; filename?: string;
  aspectRatio?: string; captionStyle?: string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────
const jobs = new Map<string, ClipJob>();
const downloadTokens = new Map<string, { filePath: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 2 * 60 * 60_000) {
      fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
      jobs.delete(id);
    }
  }
  for (const [token, entry] of downloadTokens.entries()) {
    if (entry.expiresAt < now) downloadTokens.delete(token);
  }
}, 60_000);

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const raw = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  for (const p of [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]) {
    const m = raw.match(p);
    if (m) return m[1];
  }
  return null;
}

function timeStrToSeconds(t: string): number {
  const parts = t.trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function hasCookies(): Promise<boolean> {
  try { return (await fs.promises.stat(COOKIES_PATH)).size > 50; }
  catch { return false; }
}

// ── yt-dlp download ───────────────────────────────────────────────────────────
async function downloadVideo(videoId: string, outDir: string, job: ClipJob): Promise<string> {
  job.status   = "downloading";
  job.stepLabel = "Downloading YouTube video…";
  job.progress  = 5;

  const url            = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(outDir, "source.%(ext)s");
  const cookiesExist   = await hasCookies();

  let nodePath = "node";
  try { nodePath = (await execFileAsync("which", ["node"])).stdout.trim(); } catch { /* noop */ }

  // Format priority:
  //   18  = 360p progressive (no PO token needed, very fast)
  //   22  = 720p progressive (no PO token needed)
  //   worst[ext=mp4] = fallback
  //   adaptive (needs cookies for some videos)
  const FORMAT =
    "18/22/worst[ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best";

  const args = [
    "--js-runtimes", `node:${nodePath}`,
    "-f", FORMAT,
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--no-warnings",
    "--concurrent-fragments", "8",   // parallel fragment download for speed
    "-o", outputTemplate,
  ];
  if (cookiesExist) args.push("--cookies", COOKIES_PATH);
  args.push(url);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      const line = d.toString();
      const m = line.match(/(\d+(?:\.\d+)?)%/);
      if (m) {
        job.progress  = Math.min(30, 5 + Math.round(parseFloat(m[1]) * 0.25));
        job.stepLabel = `Downloading… ${m[1]}%`;
      }
    });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) { resolve(); return; }
      const msg = stderr.toLowerCase();
      if (msg.includes("no longer valid") || msg.includes("rotated")) {
        reject(new Error(
          "COOKIES_EXPIRED: Your YouTube cookies have expired. YouTube rotates session tokens frequently — re-export them immediately after opening YouTube, or use the Upload tab instead."
        ));
      } else if (msg.includes("sign in") || msg.includes("bot") || msg.includes("login")) {
        reject(new Error(
          "CLOUD_BLOCKED: YouTube blocks downloads from cloud servers for this video. This is a YouTube restriction — cookies cannot fix it when the server IP differs from your browser IP. Use the Upload tab: download the video on your device, then upload it here."
        ));
      } else if (msg.includes("private") || msg.includes("unavailable")) {
        reject(new Error("Video is private or unavailable."));
      } else if (msg.includes("not available") || msg.includes("requested format")) {
        reject(new Error(
          "CLOUD_BLOCKED: YouTube is blocking this video from cloud servers. Use the Upload tab: download the video on your device, then upload it here."
        ));
      } else {
        reject(new Error(`Download failed: ${stderr.slice(-300)}`));
      }
    });
    proc.on("error", reject);
  });

  const files = await fs.promises.readdir(outDir);
  const mp4 = files.find(f => f.startsWith("source") && (f.endsWith(".mp4") || f.endsWith(".webm")));
  if (!mp4) throw new Error("Downloaded file not found.");
  return path.join(outDir, mp4);
}

// ── NoteGPT transcript ────────────────────────────────────────────────────────
async function fetchTranscript(videoId: string, job: ClipJob): Promise<{ segments: any[]; title: string }> {
  job.status    = "transcribing";
  job.stepLabel = "Fetching transcript…";
  job.progress  = 33;

  const userinfoRes = await fetch("https://notegpt.io/user/v2/userinfo", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const setCookie = userinfoRes.headers.get("set-cookie") ?? "";
  const sboxGuid  = setCookie.match(/sbox-guid=([^;,]+)/)?.[1] ?? "";
  const anonId    = crypto.randomUUID();

  const txRes = await fetch(
    `https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=${videoId}`,
    { headers: { "User-Agent": "Mozilla/5.0", Cookie: `sbox-guid=${sboxGuid}; anonymous_user_id=${anonId}` } },
  );
  const data = await txRes.json() as any;
  if (data.code !== 100000) throw new Error(data.message ?? "Transcript unavailable");

  const tx   = data.data;
  const segs = tx.transcripts?.en?.custom
    ?? tx.transcripts?.[Object.keys(tx.transcripts ?? {})[0]]?.custom ?? [];
  return { segments: segs, title: tx.videoInfo?.name ?? "Video" };
}

// ── Get video duration via ffprobe ────────────────────────────────────────────
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch { return 0; }
}

// ── OpenRouter AI analysis ────────────────────────────────────────────────────
async function analyzeWithAI(
  segments: any[], videoTitle: string, numClips: number, minDuration: number,
  maxDuration: number, captionStyle: string, hookFilter: string | null,
  aspectRatio: string, videoDurationSec: number, job: ClipJob,
): Promise<any[]> {
  job.status    = "analyzing";
  job.stepLabel = "AI analyzing for viral clips…";
  job.progress  = 40;

  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const apiUrl = (process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ?? "").replace(/\/$/, "");
  if (!apiKey || !apiUrl) throw new Error("OpenRouter AI integration not configured");

  const transcriptText = segments.slice(0, 200)
    .map((s: any) => `[${s.start}] ${s.text}`).join("\n").slice(0, 14000);
  const hookConstraint = hookFilter
    ? `IMPORTANT: Only suggest clips with hookType = "${hookFilter}".`
    : "hookType options: Curiosity, Shock, Story, Emotional, Educational, Inspirational, Controversial";

  const durationHint = videoDurationSec > 0
    ? `The video is ${Math.floor(videoDurationSec / 60)}m${Math.floor(videoDurationSec % 60)}s long. Spread clips across the ENTIRE video.`
    : "";

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen/qwen3.6-flash",
      max_tokens: 8192, temperature: 0.7,
      messages: [
        { role: "system", content: "You are a viral short-form video expert. Output ONLY valid JSON arrays, no markdown, no thinking tags." },
        { role: "user",   content: `Find the ${numClips} best viral clips from this video.

Video: "${videoTitle}"
STRICT RULES:
- Each clip MUST be between ${minDuration}s and ${maxDuration}s long (endTime - startTime).
- DO NOT make clips shorter than ${minDuration}s or longer than ${maxDuration}s.
- Spread clips across different parts of the video — do NOT cluster them.
- ${durationHint}
- Aspect ratio: ${aspectRatio}, captions: ${captionStyle}
${hookConstraint}

TRANSCRIPT (timestamps in MM:SS or HH:MM:SS):
${transcriptText || "No transcript — choose timestamps spread evenly across the video."}

LANGUAGE RULE: Detect the primary language of the transcript. Write EVERY text field (topic, hook, suggestedTitle, hashtags, description) in that SAME detected language. If the transcript is Urdu → write in Urdu. If Hindi → Hindi. If English → English. Never translate.

Return ONLY a JSON array (no other text):
[{
  "id":1,
  "startTime":"00:01:23",
  "endTime":"00:01:53",
  "duration":"30s",
  "topic":"one sentence description (in detected language)",
  "hookType":"Curiosity",
  "viralScore":9,
  "hook":"opening hook under 10 words (in detected language)",
  "suggestedTitle":"Catchy YouTube/TikTok title (in detected language)",
  "hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "description":"2-3 sentence caption for YouTube Shorts/TikTok (in detected language). Include what viewers will learn and end with a soft CTA."
}]` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const aiData = await res.json() as any;
  const raw = aiData.choices?.[0]?.message?.content ?? "[]";
  // Greedy match — captures the outermost [...] including nested arrays like hashtags
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array from AI");
  job.progress = 50;

  // Post-process: clamp each clip to [minDuration, maxDuration]
  const clips = JSON.parse(match[0]) as any[];
  return clips.map(c => {
    const s   = timeStrToSeconds(c.startTime ?? "00:00:00");
    let   e   = timeStrToSeconds(c.endTime   ?? "00:00:30");
    const dur = e - s;
    if (dur < minDuration) e = s + minDuration;
    if (dur > maxDuration) e = s + maxDuration;
    const mm  = Math.floor(e / 60), ss = Math.floor(e % 60);
    const hh  = Math.floor(mm / 60), rm = mm % 60;
    return {
      ...c,
      endTime:  `${String(hh).padStart(2,"0")}:${String(rm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`,
      duration: `${Math.round(e - s)}s`,
    };
  });
}

// ── Create a single clip (returns 1 or 2 outputs when face-split occurs) ──────
async function createClip(
  clip: any, videoPath: string, segments: any[], aspectRatio: string,
  captionStyle: string, outDir: string, showHook = true, hookFullDuration = false,
): Promise<Array<{ downloadToken: string; sizeMb: number; faceZone?: string; durationSec?: number }>> {
  const startSec = timeStrToSeconds(clip.startTime);
  const endSec   = timeStrToSeconds(clip.endTime);

  const clipCaptions = segments
    .filter((s: any) => {
      const t = timeStrToSeconds(s.start);
      return t >= startSec && t < endSec;
    })
    .map((s: any) => ({
      start: timeStrToSeconds(s.start) - startSec,
      end:   Math.min(timeStrToSeconds(s.start) - startSec + 4, endSec - startSec),
      text:  s.text,
    }));

  const clipDir = path.join(outDir, `clip-${clip.id}`);
  const outPath = path.join(clipDir, "clip.mp4");
  await fs.promises.mkdir(clipDir, { recursive: true });

  const input = JSON.stringify({
    input_video:   videoPath,
    output_path:   outPath,
    start_time:    clip.startTime,
    end_time:      clip.endTime,
    aspect_ratio:  aspectRatio,
    caption_style: captionStyle,
    hook:          clip.hook ?? clip.topic ?? "",
    captions:      clipCaptions,
    show_hook:          showHook,
    hook_full_duration: hookFullDuration,
  });

  const { stdout } = await execFileAsync(PYTHON, [CREATE_CLIP_SCRIPT, input], { timeout: 600_000 });
  const result = JSON.parse(stdout.trim());
  if (!result.ok) throw new Error(result.error ?? "Clip creation failed");

  // Python always returns `outputs` array (may have 2 items for face-split clips)
  const pyOutputs = (result.outputs ?? [{ output: result.output, size_mb: result.size_mb, face_zone: "full" }]) as
    Array<{ output: string; size_mb: number; face_zone?: string }>;

  const TTL = Date.now() + 4 * 60 * 60_000;
  return pyOutputs.map(o => {
    const token = crypto.randomUUID();
    downloadTokens.set(token, { filePath: o.output, expiresAt: TTL });
    return { downloadToken: token, sizeMb: o.size_mb, faceZone: o.face_zone, durationSec: (o as any).duration_sec };
  });
}

// ── Full pipeline (shared by URL and local file paths) ────────────────────────
async function runPipeline(job: ClipJob, opts: {
  videoId?: string; localVideoPath?: string; numClips: number; aspectRatio: string;
  captionStyle: string; hookFilter: string | null; minDuration: number; maxDuration: number;
  showHook?: boolean; hookFullDuration?: boolean;
}) {
  const { videoId, localVideoPath, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration, showHook = true, hookFullDuration = false } = opts;
  try {
    // 1. Get video path
    let videoPath: string;
    if (localVideoPath) {
      videoPath = localVideoPath;
      job.status    = "transcribing";
      job.stepLabel = "Video loaded — fetching transcript…";
      job.progress  = 15;
    } else if (videoId) {
      videoPath = await downloadVideo(videoId, job.dir, job);
    } else {
      throw new Error("No video source provided");
    }

    // 2. Get video duration for better AI prompting
    const videoDurationSec = await getVideoDuration(videoPath);

    // 3. Transcript (non-fatal — also skip for local videos without YouTube ID)
    let segments: any[] = [];
    if (videoId) {
      try {
        const tx = await fetchTranscript(videoId, job);
        segments = tx.segments;
        job.videoTitle = tx.title;
      } catch {
        job.stepLabel = "Transcript unavailable — creating clips without captions…";
      }
    }

    // 4. AI analysis
    const aiClips = await analyzeWithAI(
      segments, job.videoTitle ?? "Uploaded Video", numClips, minDuration,
      maxDuration, captionStyle, hookFilter, aspectRatio, videoDurationSec, job,
    );

    // 4. Init clip state
    job.totalClips = aiClips.length;
    job.clips = aiClips.map((c: any) => ({
      id: c.id, title: c.topic ?? `Clip ${c.id}`, hook: c.hook ?? "",
      hookType: c.hookType ?? "Curiosity", viralScore: c.viralScore ?? 7,
      startTime: c.startTime, endTime: c.endTime, duration: c.duration ?? "",
      suggestedTitle: c.suggestedTitle ?? c.topic ?? "",
      hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
      description: c.description ?? "",
      status: "pending" as const,
    }));
    job.status    = "creating";
    job.stepLabel = `Creating ${aiClips.length} clip${aiClips.length !== 1 ? "s" : ""} in parallel…`;
    job.progress  = 52;

    // 5. Create ALL clips in PARALLEL for speed
    await Promise.allSettled(
      aiClips.map(async (aiClip: any, i: number) => {
        const jobClip = job.clips[i];
        if (!jobClip) return;
        jobClip.status = "processing";
        try {
          const results = await createClip(
            aiClip, videoPath, segments, aspectRatio, captionStyle, job.dir, showHook, hookFullDuration,
          );

          // Primary output (always index 0)
          jobClip.status        = "done";
          jobClip.downloadToken = results[0].downloadToken;
          jobClip.sizeMb        = results[0].sizeMb;
          // Use actual rendered duration from ffprobe (overrides AI estimate)
          if (results[0].durationSec != null && results[0].durationSec > 0) {
            jobClip.duration = `${Math.round(results[0].durationSec)}s`;
          }
          job.doneClips++;

          // If face-split produced a second crop, inject a bonus clip entry
          if (results.length > 1) {
            const extra: ClipResult = {
              ...jobClip,
              id:            jobClip.id + 1000 + i,
              title:         `${jobClip.title} — Zone B`,
              suggestedTitle: jobClip.suggestedTitle ? `${jobClip.suggestedTitle} (B)` : undefined,
              status:        "done",
              downloadToken: results[1].downloadToken,
              sizeMb:        results[1].sizeMb,
            };
            job.clips.push(extra);
            job.doneClips++;
            job.totalClips++;
          }

          job.progress = Math.min(98, 52 + Math.round((job.doneClips / job.totalClips) * 46));
        } catch (err: any) {
          jobClip.status = "error";
          jobClip.error  = err.message?.slice(0, 200);
        }
      }),
    );

    job.status    = "done";
    job.progress  = 100;
    job.stepLabel = `Done — ${job.doneClips} clip${job.doneClips !== 1 ? "s" : ""} ready`;

    // 6. Persist history to DB (non-fatal)
    try {
      await db.insert(clipperHistoryTable).values({
        jobId:        job.id,
        sourceType:   job.sourceType ?? "upload",
        sourceUrl:    job.sourceUrl  ?? null,
        filename:     job.filename   ?? null,
        aspectRatio:  job.aspectRatio  ?? aspectRatio,
        captionStyle: job.captionStyle ?? captionStyle,
        numClips:     job.totalClips,
        doneClips:    job.doneClips,
        status:       "done",
        clipsJson:    JSON.stringify(job.clips.map(c => ({
          id: c.id, title: c.title, hook: c.hook, hookType: c.hookType,
          viralScore: c.viralScore, startTime: c.startTime, endTime: c.endTime,
          duration: c.duration, suggestedTitle: c.suggestedTitle,
          hashtags: c.hashtags, description: c.description,
        }))),
      }).onConflictDoNothing();
    } catch { /* ignore DB errors */ }
  } catch (err: any) {
    job.status    = "error";
    job.error     = err.message ?? "Pipeline failed";
    job.stepLabel = job.error ?? "Pipeline failed";
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/clipper/cookies-status
router.get("/clipper/cookies-status", async (_req, res): Promise<void> => {
  res.json({ hasCookies: await hasCookies() });
});

// POST /api/clipper/save-cookies
router.post("/clipper/save-cookies", async (req, res): Promise<void> => {
  const { cookies } = req.body ?? {};
  if (!cookies || typeof cookies !== "string" || cookies.length < 10) {
    res.status(400).json({ error: "cookies content required" }); return;
  }
  try {
    await fs.promises.writeFile(COOKIES_PATH, cookies, "utf8");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/clipper/upload-chunk — receive one 5 MB piece
router.post("/clipper/upload-chunk", (req, res) => {
  chunkUpload.single("chunk")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    if (!req.file) { res.status(400).json({ error: "No chunk data" }); return; }
    res.json({ ok: true, chunkIndex: Number(req.body.chunkIndex) });
  });
});

// POST /api/clipper/upload-finalize — assemble all chunks into final file
router.post("/clipper/upload-finalize", async (req, res): Promise<void> => {
  const { fileId, filename, totalChunks } = req.body ?? {};
  if (!fileId || !filename || !totalChunks) {
    res.status(400).json({ error: "Missing fileId, filename, or totalChunks" }); return;
  }
  const total    = Number(totalChunks);
  const ext      = path.extname(filename) || ".mp4";
  const outName  = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const outPath  = path.join(CLIPPER_UPLOADS_DIR, outName);
  const chunkDir = path.join(CLIPPER_CHUNKS_DIR, fileId);
  try {
    fs.mkdirSync(CLIPPER_UPLOADS_DIR, { recursive: true });
    const out = fs.createWriteStream(outPath);
    for (let i = 0; i < total; i++) {
      const data = await fs.promises.readFile(path.join(chunkDir, `chunk-${i}`));
      await new Promise<void>((resolve, reject) => out.write(data, e => e ? reject(e) : resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => e ? reject(e) : resolve()));
    fs.rmSync(chunkDir, { recursive: true, force: true });
    const sizeMb = Math.round(fs.statSync(outPath).size / 1024 / 1024 * 10) / 10;
    res.json({ filePath: outPath, originalName: filename, sizeMb });
  } catch (e: unknown) {
    res.status(500).json({ error: `Assembly failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/clipper/upload  — legacy single-request upload (small files)
router.post("/clipper/upload", (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    res.json({ filePath: req.file.path, originalName: req.file.originalname, sizeMb: Math.round(req.file.size / 1024 / 1024 * 10) / 10 });
    next();
  });
});

// POST /api/clipper/process — YouTube URL pipeline
router.post("/clipper/process", async (req, res): Promise<void> => {
  const { url, numClips = 5, aspectRatio = "9:16", captionStyle = "Bold Yellow", hookFilter = null, minDuration = 30, maxDuration = 90, showHook = true, hookFullDuration = false } = req.body ?? {};
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  const videoId = extractYouTubeId(String(url));
  if (!videoId) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  const jobId = crypto.randomUUID();
  const dir   = `/tmp/clipper-job-${jobId}`;
  await fs.promises.mkdir(dir, { recursive: true });
  const job: ClipJob = {
    id: jobId, status: "queued", stepLabel: "Starting…", progress: 0,
    clips: [], totalClips: 0, doneClips: 0, createdAt: Date.now(), dir,
    sourceType: "youtube", sourceUrl: String(url), aspectRatio, captionStyle,
  };
  jobs.set(jobId, job);
  runPipeline(job, { videoId, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration, showHook: Boolean(showHook), hookFullDuration: Boolean(hookFullDuration) }).catch(() => {});
  res.json({ jobId });
});

// POST /api/clipper/process-local — uploaded file pipeline
router.post("/clipper/process-local", async (req, res): Promise<void> => {
  const { filePath, videoTitle, filename, numClips = 5, aspectRatio = "9:16", captionStyle = "Bold Yellow", hookFilter = null, minDuration = 30, maxDuration = 90, showHook = true, hookFullDuration = false } = req.body ?? {};
  if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
  if (!fs.existsSync(filePath)) { res.status(400).json({ error: "File not found" }); return; }

  const jobId = crypto.randomUUID();
  const dir   = `/tmp/clipper-job-${jobId}`;
  await fs.promises.mkdir(dir, { recursive: true });
  const job: ClipJob = {
    id: jobId, status: "queued", stepLabel: "Starting…", progress: 0,
    clips: [], totalClips: 0, doneClips: 0, createdAt: Date.now(), dir,
    videoTitle: videoTitle ?? "Uploaded Video",
    sourceType: "upload", filename: filename ?? videoTitle ?? "video.mp4",
    aspectRatio, captionStyle,
  };
  jobs.set(jobId, job);
  runPipeline(job, { localVideoPath: filePath, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration, showHook: Boolean(showHook), hookFullDuration: Boolean(hookFullDuration) }).catch(() => {});
  res.json({ jobId });
});

// GET /api/clipper/status/:jobId
router.get("/clipper/status/:jobId", (req, res): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json({
    id: job.id, status: job.status, stepLabel: job.stepLabel,
    progress: job.progress, totalClips: job.totalClips, doneClips: job.doneClips,
    videoTitle: job.videoTitle, error: job.error,
    createdAt: job.createdAt,
    clips: job.clips.map(c => ({
      id: c.id, title: c.title, hook: c.hook, hookType: c.hookType,
      viralScore: c.viralScore, startTime: c.startTime, endTime: c.endTime,
      duration: c.duration, status: c.status, downloadToken: c.downloadToken,
      sizeMb: c.sizeMb, error: c.error,
      suggestedTitle: (c as any).suggestedTitle ?? "",
      hashtags: (c as any).hashtags ?? [],
      description: (c as any).description ?? "",
    })),
  });
});

// GET /api/clipper/preview/:token — inline video preview (no attachment header)
router.get("/clipper/preview/:token", async (req, res): Promise<void> => {
  const entry = downloadTokens.get(req.params.token);
  if (!entry || entry.expiresAt < Date.now()) {
    res.status(404).json({ error: "Preview expired or not found" }); return;
  }
  try {
    const stat = await fs.promises.stat(entry.filePath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `inline; filename="clip.mp4"`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(entry.filePath).pipe(res);
  } catch { res.status(500).json({ error: "File not found" }); }
});

// GET /api/clipper/download/:token
router.get("/clipper/download/:token", async (req, res): Promise<void> => {
  const entry = downloadTokens.get(req.params.token);
  if (!entry || entry.expiresAt < Date.now()) {
    res.status(404).json({ error: "Download link expired or not found" }); return;
  }
  try {
    const stat = await fs.promises.stat(entry.filePath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="clip.mp4"`);
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(entry.filePath).pipe(res);
  } catch { res.status(500).json({ error: "File not found" }); }
});

// GET /api/clipper/history — list past 30 sessions from DB
router.get("/clipper/history", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(clipperHistoryTable)
      .orderBy(desc(clipperHistoryTable.createdAt))
      .limit(30);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pixabay search ────────────────────────────────────────────────────────────
// GET /api/pixabay/search?q=ocean&type=video&page=1&per_page=12
router.get("/pixabay/search", async (req, res): Promise<void> => {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "PIXABAY_API_KEY not configured" });
    return;
  }

  const q        = String(req.query.q    ?? "nature");
  const type     = String(req.query.type ?? "video");   // "video" | "photo"
  const page     = Number(req.query.page    ?? 1);
  const perPage  = Number(req.query.per_page ?? 12);
  const category = req.query.category ? String(req.query.category) : undefined;

  try {
    const base = type === "video"
      ? "https://pixabay.com/api/videos/"
      : "https://pixabay.com/api/";

    const params = new URLSearchParams({
      key:        apiKey,
      q,
      page:       String(page),
      per_page:   String(Math.min(50, Math.max(3, perPage))),
      safesearch: "true",
      ...(category ? { category } : {}),
    });

    const r = await fetch(`${base}?${params}`);
    if (!r.ok) {
      res.status(r.status).json({ error: `Pixabay API error ${r.status}` });
      return;
    }
    const data = await r.json() as any;

    // Normalise so the client always gets {hits, totalHits, type}
    const hits = (data.hits ?? []).map((h: any) =>
      type === "video"
        ? {
            id:          h.id,
            tags:        h.tags,
            duration:    h.duration,
            thumbnail:   h.videos?.medium?.thumbnail ?? h.userImageURL,
            previewURL:  h.videos?.tiny?.url  ?? h.videos?.small?.url,
            downloadURL: h.videos?.medium?.url ?? h.videos?.large?.url,
            width:       h.videos?.medium?.width,
            height:      h.videos?.medium?.height,
            user:        h.user,
            type:        "video",
          }
        : {
            id:          h.id,
            tags:        h.tags,
            thumbnail:   h.webformatURL,
            downloadURL: h.largeImageURL,
            previewURL:  h.webformatURL,
            width:       h.webformatWidth,
            height:      h.webformatHeight,
            user:        h.user,
            type:        "photo",
          }
    );

    res.json({ hits, totalHits: data.totalHits ?? 0, type });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/clipper/cleanup — delete expired sessions from DB ───────────────
router.post("/clipper/cleanup", async (_req, res): Promise<void> => {
  try {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    const expiryCutoff  = new Date(Date.now() - FOUR_HOURS_MS);
    const { lt } = await import("drizzle-orm");
    const deleted = await db
      .delete(clipperHistoryTable)
      .where(lt(clipperHistoryTable.createdAt, expiryCutoff))
      .returning({ id: clipperHistoryTable.id });
    res.json({ deleted: deleted.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
