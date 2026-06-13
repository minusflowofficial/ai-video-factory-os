/**
 * Clipper pipeline
 *
 * POST /api/clipper/upload            — upload a local video file → { filePath }
 * POST /api/clipper/process           — start full pipeline (YouTube URL)
 * POST /api/clipper/process-local     — start pipeline from uploaded file
 * GET  /api/clipper/status/:jobId     — poll job progress + clip results
 * GET  /api/clipper/download/:token   — download a generated clip
 * GET  /api/clipper/cookies-status    — check cookies.txt
 * POST /api/clipper/save-cookies      — save Netscape cookies content
 */

import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import multer from "multer";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const PYTHON = process.env.PYTHON_PATH ?? "python3";
const CREATE_CLIP_SCRIPT = path.resolve("../../scripts/create_clip.py");
const COOKIES_PATH = path.resolve("../../.youtube-cookies.txt");

// ── File upload (up to 4 GB) ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "/tmp/clipper-uploads";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.mp4`),
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClipResult {
  id: number; title: string; hook: string; hookType: string;
  viralScore: number; startTime: string; endTime: string; duration: string;
  status: "pending" | "processing" | "done" | "error";
  downloadToken?: string; sizeMb?: number; error?: string;
}
interface ClipJob {
  id: string;
  status: "queued" | "uploading" | "downloading" | "transcribing" | "analyzing" | "creating" | "done" | "error";
  stepLabel: string; progress: number;
  clips: ClipResult[]; totalClips: number; doneClips: number;
  videoTitle?: string; error?: string; createdAt: number; dir: string;
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

Return ONLY a JSON array (no other text):
[{
  "id":1,
  "startTime":"00:01:23",
  "endTime":"00:01:53",
  "duration":"30s",
  "topic":"one sentence description",
  "hookType":"Curiosity",
  "viralScore":9,
  "hook":"opening hook under 12 words",
  "suggestedTitle":"Catchy YouTube/TikTok title for this clip",
  "hashtags":["#viral","#trending","#topic","#niche","#shorts"],
  "description":"2-3 sentence caption/description for this clip that can be copy-pasted to YouTube Shorts or TikTok. Include the hook, what viewers will learn, and end with a soft CTA."
}]` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const aiData = await res.json() as any;
  const raw = aiData.choices?.[0]?.message?.content ?? "[]";
  const match = raw.match(/\[[\s\S]*?\]/);
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

// ── Create a single clip ──────────────────────────────────────────────────────
async function createClip(
  clip: any, videoPath: string, segments: any[], aspectRatio: string,
  captionStyle: string, outDir: string,
): Promise<{ downloadToken: string; sizeMb: number }> {
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
  });

  const { stdout } = await execFileAsync(PYTHON, [CREATE_CLIP_SCRIPT, input], { timeout: 600_000 });
  const result = JSON.parse(stdout.trim());
  if (!result.ok) throw new Error(result.error ?? "Clip creation failed");

  const token = crypto.randomUUID();
  downloadTokens.set(token, { filePath: outPath, expiresAt: Date.now() + 4 * 60 * 60_000 });
  return { downloadToken: token, sizeMb: result.size_mb };
}

// ── Full pipeline (shared by URL and local file paths) ────────────────────────
async function runPipeline(job: ClipJob, opts: {
  videoId?: string; localVideoPath?: string; numClips: number; aspectRatio: string;
  captionStyle: string; hookFilter: string | null; minDuration: number; maxDuration: number;
}) {
  const { videoId, localVideoPath, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration } = opts;
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
          const { downloadToken, sizeMb } = await createClip(
            aiClip, videoPath, segments, aspectRatio, captionStyle, job.dir,
          );
          jobClip.status        = "done";
          jobClip.downloadToken = downloadToken;
          jobClip.sizeMb        = sizeMb;
          job.doneClips++;
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

// POST /api/clipper/upload  — multipart file upload
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
  const { url, numClips = 5, aspectRatio = "9:16", captionStyle = "Bold Yellow", hookFilter = null, minDuration = 30, maxDuration = 90 } = req.body ?? {};
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  const videoId = extractYouTubeId(String(url));
  if (!videoId) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  const jobId = crypto.randomUUID();
  const dir   = `/tmp/clipper-job-${jobId}`;
  await fs.promises.mkdir(dir, { recursive: true });
  const job: ClipJob = { id: jobId, status: "queued", stepLabel: "Starting…", progress: 0, clips: [], totalClips: 0, doneClips: 0, createdAt: Date.now(), dir };
  jobs.set(jobId, job);
  runPipeline(job, { videoId, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration }).catch(() => {});
  res.json({ jobId });
});

// POST /api/clipper/process-local — uploaded file pipeline
router.post("/clipper/process-local", async (req, res): Promise<void> => {
  const { filePath, videoTitle, numClips = 5, aspectRatio = "9:16", captionStyle = "Bold Yellow", hookFilter = null, minDuration = 30, maxDuration = 90 } = req.body ?? {};
  if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
  if (!fs.existsSync(filePath)) { res.status(400).json({ error: "File not found" }); return; }

  const jobId = crypto.randomUUID();
  const dir   = `/tmp/clipper-job-${jobId}`;
  await fs.promises.mkdir(dir, { recursive: true });
  const job: ClipJob = {
    id: jobId, status: "queued", stepLabel: "Starting…", progress: 0,
    clips: [], totalClips: 0, doneClips: 0, createdAt: Date.now(), dir,
    videoTitle: videoTitle ?? "Uploaded Video",
  };
  jobs.set(jobId, job);
  runPipeline(job, { localVideoPath: filePath, numClips, aspectRatio, captionStyle, hookFilter, minDuration, maxDuration }).catch(() => {});
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

export default router;
