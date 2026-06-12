/**
 * Clipper — Full pipeline: YouTube → yt-dlp download → AI analysis → FFmpeg clip + captions
 *
 * POST /api/clipper/process          — start full pipeline, returns { jobId }
 * GET  /api/clipper/status/:jobId    — poll job progress + clip results
 * GET  /api/clipper/download/:token  — download a generated clip
 */

import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const PYTHON = process.env.PYTHON_PATH ?? "python3";
const CREATE_CLIP_SCRIPT = path.resolve("../../scripts/create_clip.py");

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClipResult {
  id: number;
  title: string;
  hook: string;
  hookType: string;
  viralScore: number;
  startTime: string;
  endTime: string;
  duration: string;
  status: "pending" | "processing" | "done" | "error";
  downloadToken?: string;
  sizeMb?: number;
  error?: string;
}

interface ClipJob {
  id: string;
  status: "queued" | "downloading" | "transcribing" | "analyzing" | "creating" | "done" | "error";
  stepLabel: string;
  progress: number;
  clips: ClipResult[];
  totalClips: number;
  doneClips: number;
  videoTitle?: string;
  error?: string;
  createdAt: number;
  dir: string;
}

// ── In-memory stores ───────────────────────────────────────────────────────────
const jobs = new Map<string, ClipJob>();
const downloadTokens = new Map<string, { filePath: string; expiresAt: number }>();

// Expire old jobs + tokens every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 60 * 60_000) { // 1 hour
      fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
      jobs.delete(id);
    }
  }
  for (const [token, entry] of downloadTokens.entries()) {
    if (entry.expiresAt < now) {
      downloadTokens.delete(token);
    }
  }
}, 60_000);

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
               : `${m}:${String(s).padStart(2, "0")}`;
}

// ── Download YouTube video via yt-dlp ─────────────────────────────────────────
async function downloadVideo(videoId: string, outDir: string, job: ClipJob): Promise<string> {
  job.status = "downloading";
  job.stepLabel = "Downloading YouTube video…";
  job.progress = 5;

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(outDir, "source.%(ext)s");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]",
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "-o", outputTemplate,
      url,
    ]);

    proc.stdout.on("data", (d: Buffer) => {
      const line = d.toString();
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        job.progress = Math.min(30, 5 + Math.round(parseFloat(match[1]) * 0.25));
        job.stepLabel = `Downloading… ${match[1]}%`;
      }
    });
    proc.on("close", code => code === 0 ? resolve() : reject(new Error("yt-dlp failed (video may be unavailable or geo-restricted)")));
    proc.on("error", reject);
  });

  // Find downloaded file
  const files = await fs.promises.readdir(outDir);
  const mp4 = files.find(f => f.startsWith("source") && f.endsWith(".mp4"));
  if (!mp4) throw new Error("Downloaded file not found");
  return path.join(outDir, mp4);
}

// ── Fetch transcript from NoteGPT ─────────────────────────────────────────────
async function fetchTranscript(videoId: string, job: ClipJob): Promise<{ segments: any[]; title: string }> {
  job.status = "transcribing";
  job.stepLabel = "Fetching transcript…";
  job.progress = 33;

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
  if (data.code !== 100000) throw new Error(data.message ?? "Transcript not available");

  const tx = data.data;
  const segs: any[] = tx.transcripts?.en?.custom ?? tx.transcripts?.[Object.keys(tx.transcripts ?? {})[0]]?.custom ?? [];
  return { segments: segs, title: tx.videoInfo?.name ?? "Video" };
}

// ── AI analysis via OpenRouter ─────────────────────────────────────────────────
async function analyzeWithAI(
  segments: any[], videoTitle: string, numClips: number, minDuration: number,
  captionStyle: string, hookFilter: string | null, aspectRatio: string, job: ClipJob,
): Promise<any[]> {
  job.status = "analyzing";
  job.stepLabel = "AI analyzing for viral clips…";
  job.progress = 40;

  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const apiUrl = (process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
  if (!apiKey) throw new Error("AI integration not configured");

  const trimmed = segments.slice(0, 150);
  const transcriptText = trimmed.map((s: any) => `[${s.start}] ${s.text}`).join("\n").slice(0, 12000);
  const hookConstraint = hookFilter
    ? `IMPORTANT: Only suggest clips with hookType = "${hookFilter}".`
    : `hookType options: Curiosity, Shock, Debate, Story, Emotional, Educational, Contrarian, Inspirational, Controversial, Fear, Warning`;

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen/qwen3.6-flash",
      max_tokens: 8192,
      temperature: 0.7,
      messages: [
        { role: "system", content: "You are a viral short-form video expert. Output ONLY valid JSON arrays, no markdown." },
        { role: "user", content: `Find the ${numClips} best viral clips from this video.

Video: "${videoTitle}"
Settings: ${numClips} clips, min ${minDuration}s each, aspect ${aspectRatio}, captions: ${captionStyle}
${hookConstraint}

TRANSCRIPT:
${transcriptText}

Return ONLY a JSON array:
[{"id":1,"startTime":"00:01:23","endTime":"00:02:45","duration":"82s","topic":"one sentence","hookType":"Curiosity","viralScore":9,"platform":"TikTok, YouTube Shorts","hook":"hook under 12 words","punchline":"key reveal","titleIdeas":["T1","T2","T3"],"hashtags":["#tag1","#tag2"],"captionStyle":"${captionStyle}"}]` },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI API error ${res.status}: ${await res.text()}`);
  const aiData = await res.json() as any;
  const raw = aiData.choices?.[0]?.message?.content ?? "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON from AI");
  job.progress = 50;
  return JSON.parse(match[0]);
}

// ── Create a single clip via Python ──────────────────────────────────────────
async function createClip(
  clip: any, videoPath: string, segments: any[], aspectRatio: string,
  captionStyle: string, outDir: string,
): Promise<{ downloadToken: string; sizeMb: number }> {
  const startSec = timeStrToSeconds(clip.startTime);
  const endSec   = timeStrToSeconds(clip.endTime);

  // Build relative captions from transcript
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

  const clipDir  = path.join(outDir, `clip-${clip.id}`);
  const outPath  = path.join(clipDir, "clip.mp4");
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
  downloadTokens.set(token, { filePath: outPath, expiresAt: Date.now() + 2 * 60 * 60_000 }); // 2hr
  return { downloadToken: token, sizeMb: result.size_mb };
}

// ── Full pipeline ─────────────────────────────────────────────────────────────
async function runPipeline(job: ClipJob, opts: {
  videoId: string; numClips: number; aspectRatio: string;
  captionStyle: string; hookFilter: string | null; minDuration: number;
}) {
  const { videoId, numClips, aspectRatio, captionStyle, hookFilter, minDuration } = opts;

  try {
    // 1. Download
    const videoPath = await downloadVideo(videoId, job.dir, job);

    // 2. Transcript (allow failure — will still create clips without captions)
    let segments: any[] = [];
    try {
      const tx = await fetchTranscript(videoId, job);
      segments = tx.segments;
      job.videoTitle = tx.title;
    } catch {
      job.stepLabel = "Transcript unavailable — creating clips without captions…";
    }

    // 3. AI analysis
    const aiClips = await analyzeWithAI(segments, job.videoTitle ?? "Video", numClips, minDuration, captionStyle, hookFilter, aspectRatio, job);

    // 4. Initialize clip results
    job.totalClips = aiClips.length;
    job.clips = aiClips.map((c: any) => ({
      id: c.id, title: c.topic ?? `Clip ${c.id}`, hook: c.hook ?? "",
      hookType: c.hookType ?? "Curiosity", viralScore: c.viralScore ?? 7,
      startTime: c.startTime, endTime: c.endTime, duration: c.duration ?? "",
      status: "pending",
    }));
    job.status = "creating";

    // 5. Create clips one by one
    for (let i = 0; i < aiClips.length; i++) {
      const aiClip = aiClips[i];
      const jobClip = job.clips[i];
      if (!jobClip) continue;

      jobClip.status = "processing";
      job.stepLabel = `Creating clip ${i + 1} of ${aiClips.length}…`;
      job.progress = 50 + Math.round((i / aiClips.length) * 45);

      try {
        const { downloadToken, sizeMb } = await createClip(aiClip, videoPath, segments, aspectRatio, captionStyle, job.dir);
        jobClip.status = "done";
        jobClip.downloadToken = downloadToken;
        jobClip.sizeMb = sizeMb;
        job.doneClips++;
      } catch (err: any) {
        jobClip.status = "error";
        jobClip.error = err.message?.slice(0, 200);
      }
    }

    job.status = "done";
    job.progress = 100;
    job.stepLabel = `Done — ${job.doneClips} clip${job.doneClips !== 1 ? "s" : ""} ready`;
  } catch (err: any) {
    job.status = "error";
    job.error = err.message ?? "Pipeline failed";
    job.stepLabel = job.error ?? "Pipeline failed";
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/clipper/process
router.post("/clipper/process", async (req, res): Promise<void> => {
  const {
    url, numClips = 5, aspectRatio = "9:16",
    captionStyle = "Bold Yellow", hookFilter = null, minDuration = 30,
  } = req.body ?? {};

  if (!url) { res.status(400).json({ error: "url required" }); return; }
  const videoId = extractYouTubeId(String(url));
  if (!videoId) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  const jobId = crypto.randomUUID();
  const dir   = `/tmp/clipper-job-${jobId}`;
  await fs.promises.mkdir(dir, { recursive: true });

  const job: ClipJob = {
    id: jobId, status: "queued", stepLabel: "Starting…", progress: 0,
    clips: [], totalClips: 0, doneClips: 0, createdAt: Date.now(), dir,
  };
  jobs.set(jobId, job);

  // Fire and forget
  runPipeline(job, { videoId, numClips, aspectRatio, captionStyle, hookFilter, minDuration }).catch(() => {});

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
    })),
  });
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
  } catch {
    res.status(500).json({ error: "File not found" });
  }
});

export default router;
