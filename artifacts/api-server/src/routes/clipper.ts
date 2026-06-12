/**
 * Clipper Tool — YouTube Transcript → AI Viral Analysis → Face-Centered Clip Extraction
 *
 * Routes:
 *   POST /api/clipper/transcript  — fetch transcript via NoteGPT API
 *   POST /api/clipper/analyze     — AI viral clip analysis (Claude Haiku)
 *   POST /api/clipper/clip        — face-centered clip extraction (Python + OpenCV)
 *   GET  /api/clipper/clip/:token — download a generated clip
 */

import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const PYTHON = process.env.PYTHON_PATH ?? "python3";
const FACE_CLIP_SCRIPT = path.resolve("scripts/face_clip.py");

// In-memory store for clip download tokens (cleared after 10 min)
const clipTokens = new Map<string, { filePath: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of clipTokens.entries()) {
    if (entry.expiresAt < now) {
      fs.promises.rm(path.dirname(entry.filePath), { recursive: true, force: true }).catch(() => {});
      clipTokens.delete(token);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Transcript: NoteGPT proxy
// ---------------------------------------------------------------------------
router.post("/clipper/transcript", async (req, res): Promise<void> => {
  const { url } = req.body ?? {};
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  const videoId = extractYouTubeId(String(url));
  if (!videoId) { res.status(400).json({ error: "Invalid YouTube URL or video ID" }); return; }

  try {
    // Step 1 — Get session cookie from NoteGPT
    const userinfoRes = await fetch("https://notegpt.io/user/v2/userinfo", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const setCookie = userinfoRes.headers.get("set-cookie") ?? "";
    const sboxGuid  = setCookie.match(/sbox-guid=([^;,]+)/)?.[1] ?? "";
    const anonId    = crypto.randomUUID();

    // Step 2 — Fetch transcript
    const transcriptRes = await fetch(
      `https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=${videoId}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Cookie: `sbox-guid=${sboxGuid}; anonymous_user_id=${anonId}`,
        },
      },
    );

    const data = await transcriptRes.json() as any;
    if (data.code !== 100000) {
      res.status(400).json({ error: data.message ?? "Transcript not available for this video" });
      return;
    }

    res.json(data.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to fetch transcript" });
  }
});

// ---------------------------------------------------------------------------
// Analyze: AI viral clip detection using Claude
// ---------------------------------------------------------------------------
router.post("/clipper/analyze", async (req, res): Promise<void> => {
  const { transcripts, videoInfo, language = "en" } = req.body ?? {};
  if (!transcripts) { res.status(400).json({ error: "transcripts required" }); return; }

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const apiUrl = (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");

  if (!apiKey) {
    res.status(402).json({ error: "AI integration not configured. Contact support." });
    return;
  }

  // Format the transcript (pick the selected language)
  const segments: Array<{ start: string; end: string; text: string }> =
    transcripts[language]?.custom ?? transcripts["en"]?.custom ?? [];

  if (!segments.length) {
    res.status(400).json({ error: "No transcript segments found for language: " + language });
    return;
  }

  const title    = videoInfo?.name ?? "Unknown Video";
  const author   = videoInfo?.author ?? "";
  const duration = videoInfo?.duration ? formatDuration(parseInt(videoInfo.duration)) : "";
  const transcriptText = segments
    .map(s => `[${s.start}] ${s.text}`)
    .join("\n")
    .slice(0, 10000); // Cap at 10k chars for Claude Haiku context

  const prompt = `You are an elite YouTube Shorts, TikTok, and Instagram Reels expert.

Analyze this transcript and find the BEST viral short-form clip opportunities.

Video: "${title}" by ${author}
Duration: ${duration}

TRANSCRIPT:
${transcriptText}

---

Find 5-10 clips scoring 7+ viral potential. Output ONLY a valid JSON array — no markdown, no explanation:

[
  {
    "id": 1,
    "startTime": "00:01:23",
    "endTime": "00:02:45",
    "duration": "82s",
    "topic": "Core topic in one sentence",
    "hookType": "Curiosity",
    "viralScore": 9,
    "platform": "TikTok, YouTube Shorts",
    "hook": "Best hook under 12 words",
    "punchline": "The key reveal or emotional peak",
    "whyItWorks": "Why viewers will stop scrolling and stay",
    "ctaOptions": ["CTA 1", "CTA 2", "CTA 3"],
    "titleIdeas": ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
    "editorNotes": "Specific editing instructions",
    "hookStrength": 8,
    "retentionScore": 7,
    "shareability": 9,
    "commentPotential": 8
  }
]

hookType options: Curiosity, Shock, Debate, Story, Emotional, Educational, Contrarian, Inspirational, Controversial, Fear, Warning
Return ONLY the JSON array.`;

  try {
    const aiRes = await fetch(`${apiUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`Claude API ${aiRes.status}: ${await aiRes.text()}`);
    }

    const aiData = await aiRes.json() as any;
    const raw    = aiData.content?.[0]?.text ?? "[]";

    // Parse JSON — be lenient with surrounding text
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const clips = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    res.json({ clips, transcriptSegments: segments.length, model: "claude-haiku-4-5" });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "AI analysis failed" });
  }
});

// ---------------------------------------------------------------------------
// Clip: face-centered extraction from a video URL
// ---------------------------------------------------------------------------
router.post("/clipper/clip", async (req, res): Promise<void> => {
  const { videoUrl, startTime, endTime, aspectRatio = "9:16", clipId = 1 } = req.body ?? {};
  if (!videoUrl || !startTime || !endTime) {
    res.status(400).json({ error: "videoUrl, startTime, endTime required" });
    return;
  }

  const dir = `/tmp/clipper-${Date.now()}-${clipId}`;
  await fs.promises.mkdir(dir, { recursive: true });

  try {
    // Download source video
    const inputPath = path.join(dir, "source.mp4");
    const videoRes  = await fetch(String(videoUrl), {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!videoRes.ok) {
      res.status(400).json({ error: `Video download failed: ${videoRes.status}` });
      return;
    }
    const buf = await videoRes.arrayBuffer();
    await fs.promises.writeFile(inputPath, Buffer.from(buf));

    // Run Python face detection + clip
    const outputPath = path.join(dir, `clip-${clipId}.mp4`);
    const { stdout } = await execFileAsync(PYTHON, [
      FACE_CLIP_SCRIPT,
      inputPath,
      String(startTime),
      String(endTime),
      outputPath,
      String(aspectRatio),
    ], { timeout: 300_000 });

    const result = JSON.parse(stdout.trim() || "{}");

    // Create download token (valid for 10 minutes)
    const token = crypto.randomUUID();
    clipTokens.set(token, { filePath: outputPath, expiresAt: Date.now() + 10 * 60_000 });

    res.json({ ...result, downloadToken: token });
  } catch (err: any) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ error: err.message ?? "Clip extraction failed" });
  }
});

// ---------------------------------------------------------------------------
// Download clip by token
// ---------------------------------------------------------------------------
router.get("/clipper/download/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const entry = clipTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    res.status(404).json({ error: "Download link expired or not found" });
    return;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractYouTubeId(url: string): string | null {
  const raw = url.trim();
  // Raw 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
               : `${m}:${String(s).padStart(2, "0")}`;
}

export default router;
