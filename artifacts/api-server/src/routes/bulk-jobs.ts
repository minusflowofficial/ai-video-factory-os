import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { db, bulkJobsTable } from "@workspace/db";
import {
  CreateBulkJobBody,
} from "@workspace/api-zod";
import { searchMixkitVideos, searchMixkitMusic } from "../mixkit-search";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

// ── Variation keywords to ensure unique clips per video ──────────────────────
const VARIATION_WORDS = [
  "nature", "cinematic", "aerial", "urban", "sunset", "ocean", "forest",
  "mountain", "abstract", "travel", "lifestyle", "modern", "peaceful",
  "dramatic", "colorful", "minimal", "dynamic", "scenic", "beautiful",
];

function mixkitVideoUrl(id: number) { return `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`; }
function mixkitMusicUrl(id: number) { return `https://assets.mixkit.co/music/${id}/${id}.mp3`; }

// ── Routes ───────────────────────────────────────────────────────────────────
router.get("/bulk-jobs", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(bulkJobsTable).orderBy(desc(bulkJobsTable.createdAt));
  res.json(jobs.map(serializeBulkJob));
});

router.post("/bulk-jobs", async (req, res): Promise<void> => {
  const parsed = CreateBulkJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { niche, goal, totalVideos, aspectRatio, language } = parsed.data as any;

  const [job] = await db.insert(bulkJobsTable).values({
    niche,
    goal: goal ?? null,
    totalVideos,
    pendingCount: totalVideos,
    processingCount: 0,
    completedCount: 0,
    failedCount: 0,
    status: "pending",
  }).returning();

  const ar   = aspectRatio ?? "9:16";
  const lang = language    ?? "English";

  if (goal === "quotes") {
    runBulkQuotesPipeline(job.id, niche, totalVideos, ar, lang).catch(() => {});
  } else {
    runBulkPipeline(job.id, niche, totalVideos, ar).catch(() => {});
  }

  res.status(201).json(serializeBulkJob(job));
});

router.get("/bulk-jobs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, id));
  if (!job) { res.status(404).json({ error: "Bulk job not found" }); return; }
  res.json(serializeBulkJob(job));
});

router.post("/bulk-jobs/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [job] = await db.update(bulkJobsTable).set({
    status: "cancelled",
    updatedAt: new Date(),
  }).where(eq(bulkJobsTable.id, id)).returning();
  if (!job) { res.status(404).json({ error: "Bulk job not found" }); return; }
  res.json(serializeBulkJob(job));
});

// ── Standard bulk pipeline ───────────────────────────────────────────────────
async function runBulkPipeline(jobId: number, niche: string, totalVideos: number, aspectRatio: string) {
  const PORT = process.env.PORT ?? 8080;
  const BASE = `http://localhost:${PORT}`;
  const CONCURRENCY = 2;

  await db.update(bulkJobsTable).set({
    status: "processing",
    processingCount: Math.min(CONCURRENCY, totalVideos),
    updatedAt: new Date(),
  }).where(eq(bulkJobsTable.id, jobId));

  let completedCount = 0;
  let failedCount = 0;

  const processOne = async (videoNum: number) => {
    const [current] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!current || current.status === "cancelled") return;

    // Pick a unique variation word so each video uses a different search term → different clips
    const variation = VARIATION_WORDS[(videoNum - 1) % VARIATION_WORDS.length];
    const variedTopic = `${niche} ${variation}`;

    try {
      const createRes = await fetch(`${BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${niche} #${videoNum}`,
          topic: variedTopic,
          niche,
          duration: "60s",
          aspectRatio,
          captionStyle: "Bold Yellow",
        }),
      });
      if (!createRes.ok) throw new Error("project create failed");
      const project = await createRes.json();
      const pid = project.id;

      await fetch(`${BASE}/api/projects/${pid}/generate-assets`, { method: "POST" });
      await fetch(`${BASE}/api/projects/${pid}/generate-voiceover`, { method: "POST" });
      await fetch(`${BASE}/api/projects/${pid}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCaptions: false, showTitle: false, transitionEffect: "zoom", addSfx: false }),
      });

      const RUNNING = new Set(["rendering", "scripting", "fetching-assets", "voiceover", "assets-ready", "music-ready", "processing"]);
      let finalStatus = "rendering";
      let attempts = 0;
      while (RUNNING.has(finalStatus) && attempts < 96) {
        await sleep(5000);
        const r = await fetch(`${BASE}/api/projects/${pid}`);
        finalStatus = (await r.json()).status ?? "error";
        attempts++;
      }

      if (finalStatus === "completed") completedCount++;
      else failedCount++;
    } catch { failedCount++; }

    const remaining = totalVideos - completedCount - failedCount;
    await db.update(bulkJobsTable).set({
      completedCount, failedCount,
      pendingCount: Math.max(0, remaining),
      processingCount: Math.min(CONCURRENCY, remaining),
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
  };

  for (let i = 0; i < totalVideos; i += CONCURRENCY) {
    const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!job || job.status === "cancelled") break;
    const batch = Array.from({ length: Math.min(CONCURRENCY, totalVideos - i) }, (_, k) => i + k + 1);
    await Promise.all(batch.map(n => processOne(n)));
  }

  await markFinished(jobId, completedCount, failedCount);
}

// ── Music moods for variety (one per video index, cycles) ────────────────────
const MUSIC_MOODS = [
  "calm", "upbeat", "inspiring", "emotional", "energetic",
  "peaceful", "powerful", "dramatic", "motivational", "serene",
  "cinematic", "ambient", "happy", "melancholic", "triumphant",
];

// ── Quotes bulk pipeline ─────────────────────────────────────────────────────
async function runBulkQuotesPipeline(jobId: number, topic: string, totalVideos: number, aspectRatio: string, language = "English") {
  const CONCURRENCY = 2;
  const OUTPUTS_DIR = "/tmp/quote-outputs";
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

  await db.update(bulkJobsTable).set({
    status: "processing",
    processingCount: Math.min(CONCURRENCY, totalVideos),
    updatedAt: new Date(),
  }).where(eq(bulkJobsTable.id, jobId));

  // Generate all quotes upfront via AI
  const quotes = await generateQuotes(topic, totalVideos, language);

  let completedCount = 0;
  let failedCount = 0;

  const processQuote = async (quoteText: string, index: number) => {
    const [current] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!current || current.status === "cancelled") return;

    try {
      // Pick unique variation keyword + music mood per video index for variety
      const variation = VARIATION_WORDS[index % VARIATION_WORDS.length];
      const mood      = MUSIC_MOODS[index % MUSIC_MOODS.length];
      const searchTerms = [topic, variation, "cinematic"];

      // Fetch unique bg video + music per video (different mood per index)
      const videoIds = await searchMixkitVideos(searchTerms, 1);
      const videoId  = videoIds[0];
      const bgUrl    = mixkitVideoUrl(videoId);
      const musicUrl = await searchMixkitMusic([mood, topic, variation]);

      const outputPath = path.join(OUTPUTS_DIR, `quote-${jobId}-${index}-${Date.now()}.mp4`);
      const scriptPath = path.resolve("../../scripts/create_quote_video.py");

      const { stdout, stderr } = await execFileAsync("python3", [
        scriptPath,
        quoteText,
        bgUrl,
        musicUrl,
        outputPath,
        aspectRatio,
        language,
      ], { timeout: 240_000 });

      if (stderr) console.error(`[bulk-quotes] video ${index} stderr:`, stderr.slice(-500));
      if (!stdout.startsWith("OK:")) throw new Error(`Script output unexpected: ${stdout.slice(0, 200)}`);

      completedCount++;
    } catch (e: any) {
      console.error(`[bulk-quotes] job ${jobId} video ${index} failed: ${e?.message ?? e}`);
      failedCount++;
    }

    const remaining = totalVideos - completedCount - failedCount;
    await db.update(bulkJobsTable).set({
      completedCount, failedCount,
      pendingCount: Math.max(0, remaining),
      processingCount: Math.min(CONCURRENCY, remaining),
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
  };

  for (let i = 0; i < quotes.length; i += CONCURRENCY) {
    const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    if (!job || job.status === "cancelled") break;
    const batch = quotes.slice(i, i + CONCURRENCY).map((q, k) => processQuote(q, i + k));
    await Promise.all(batch);
  }

  await markFinished(jobId, completedCount, failedCount);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function generateQuotes(topic: string, count: number, language = "English"): Promise<string[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const apiKey  = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ?? "";

  console.log(`[bulk-quotes] Generating ${count} quotes | topic="${topic}" | language="${language}"`);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3-flash",
        messages: [{
          role: "user",
          content: `Generate exactly ${count} unique, powerful ${topic} quotes for short videos. Write every quote in ${language}. Each quote must be 1-2 sentences, emotionally resonant, and completely different from the others. Return ONLY a valid JSON array of strings — no markdown, no explanation, no numbering, no <think> tags. Example: ["Quote one.", "Quote two."]`,
        }],
        max_tokens: Math.min(6000, count * 100),
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (res.ok) {
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, count).map(String);
        }
      }
    }
  } catch (e) {
    console.error("[bulk-quotes] quote generation failed:", e);
  }

  // Fallback: generate simple numbered quotes
  const fallbacks = [
    "Every moment is a fresh beginning.",
    "Success is not final; failure is not fatal. It is the courage to continue that counts.",
    "Believe you can and you're halfway there.",
    "The only way to do great work is to love what you do.",
    "Your life does not get better by chance; it gets better by change.",
    "Dream big. Work hard. Stay focused.",
    "The secret of getting ahead is getting started.",
    "It always seems impossible until it's done.",
    "Push yourself because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
  ];
  return Array.from({ length: count }, (_, i) => fallbacks[i % fallbacks.length]);
}

async function markFinished(jobId: number, completedCount: number, failedCount: number) {
  const [job] = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
  if (job && job.status !== "cancelled") {
    await db.update(bulkJobsTable).set({
      status: "completed",
      completedCount,
      failedCount,
      pendingCount: 0,
      processingCount: 0,
      updatedAt: new Date(),
    }).where(eq(bulkJobsTable.id, jobId));
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function serializeBulkJob(j: typeof bulkJobsTable.$inferSelect) {
  return {
    id:              j.id,
    niche:           j.niche,
    goal:            j.goal,
    totalVideos:     j.totalVideos,
    pendingCount:    j.pendingCount,
    processingCount: j.processingCount,
    completedCount:  j.completedCount,
    failedCount:     j.failedCount,
    status:          j.status,
    createdAt:       j.createdAt.toISOString(),
    updatedAt:       j.updatedAt ? j.updatedAt.toISOString() : null,
  };
}

export default router;
