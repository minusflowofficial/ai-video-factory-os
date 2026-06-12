/**
 * TTS (Text-to-Speech) voiceover generation using free Microsoft Edge TTS.
 *
 * API:
 *   GET  /api/tts/voices              — list available voices
 *   POST /api/projects/:id/generate-tts — generate voiceover for project
 *   GET  /api/projects/:id/tts-status  — check if voiceover.mp3 exists
 *
 * Generated audio: /tmp/render-{id}/voiceover.mp3
 * Render pipeline mixes it as narration + music at 15% volume.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, projectsTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const EDGE_TTS = process.env.EDGE_TTS_PATH ?? "/home/runner/workspace/.pythonlibs/bin/edge-tts";

export const TTS_VOICES = [
  { id: "en-US-AriaNeural",          name: "Aria",        gender: "female", style: "Natural",      flag: "🇺🇸" },
  { id: "en-US-JennyNeural",         name: "Jenny",       gender: "female", style: "Professional", flag: "🇺🇸" },
  { id: "en-US-AvaNeural",           name: "Ava",         gender: "female", style: "Warm",         flag: "🇺🇸" },
  { id: "en-US-EmmaNeural",          name: "Emma",        gender: "female", style: "Cheerful",     flag: "🇺🇸" },
  { id: "en-US-MichelleNeural",      name: "Michelle",    gender: "female", style: "Energetic",    flag: "🇺🇸" },
  { id: "en-US-GuyNeural",           name: "Guy",         gender: "male",   style: "Natural",      flag: "🇺🇸" },
  { id: "en-US-EricNeural",          name: "Eric",        gender: "male",   style: "Professional", flag: "🇺🇸" },
  { id: "en-US-ChristopherNeural",   name: "Christopher", gender: "male",   style: "Deep",         flag: "🇺🇸" },
  { id: "en-US-BrianNeural",         name: "Brian",       gender: "male",   style: "Warm",         flag: "🇺🇸" },
  { id: "en-GB-SoniaNeural",         name: "Sonia",       gender: "female", style: "British",      flag: "🇬🇧" },
  { id: "en-GB-RyanNeural",          name: "Ryan",        gender: "male",   style: "British",      flag: "🇬🇧" },
  { id: "en-AU-NatashaNeural",       name: "Natasha",     gender: "female", style: "Australian",   flag: "🇦🇺" },
  { id: "en-IN-NeerjaNeural",        name: "Neerja",      gender: "female", style: "Indian",       flag: "🇮🇳" },
];

/** List available Edge TTS voices */
router.get("/tts/voices", async (_req, res): Promise<void> => {
  res.json({ voices: TTS_VOICES, provider: "Microsoft Edge TTS (free, no API key needed)" });
});

/** Check if voiceover file exists for a project */
router.get("/projects/:id/tts-status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const voicePath = `/tmp/render-${id}/voiceover.mp3`;
  const exists = await fs.promises.access(voicePath).then(() => true).catch(() => false);
  let durationSecs = 0;
  if (exists) {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "quiet", "-print_format", "json", "-show_format", voicePath,
      ]);
      durationSecs = parseFloat(JSON.parse(stdout).format?.duration ?? "0");
    } catch { /* ignore */ }
  }
  res.json({ hasVoiceover: exists, durationSecs });
});

/** Generate voiceover for a project using Edge TTS */
router.post("/projects/:id/generate-tts", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const text = project.script ?? project.hook ?? project.title;
  if (!text?.trim()) {
    res.status(400).json({ error: "No script to synthesize. Generate a script first." });
    return;
  }

  const voiceId  = (req.body?.voiceId  as string) ?? "en-US-AriaNeural";
  const rate     = (req.body?.rate     as string) ?? "+0%";
  const pitch    = (req.body?.pitch    as string) ?? "+0Hz";

  // Update status immediately, then generate in background
  await db.update(projectsTable).set({ status: "voiceover", updatedAt: new Date() })
    .where(eq(projectsTable.id, id));

  res.json({ id, status: "voiceover", voice: voiceId, message: "Generating voiceover…" });

  generateEdgeTTS(id, text, voiceId, rate, pitch).catch(() => {});
});

async function generateEdgeTTS(
  id: number,
  text: string,
  voiceId: string,
  rate: string,
  pitch: string,
): Promise<void> {
  const dir = `/tmp/render-${id}`;
  await fs.promises.mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, "voiceover.mp3");

  try {
    await execFileAsync(EDGE_TTS, [
      "--voice", voiceId,
      "--rate",  rate,
      "--pitch", pitch,
      "--text",  text,
      "--write-media", outputPath,
    ], { timeout: 120_000 });

    await db.update(projectsTable)
      .set({ status: "scripting", updatedAt: new Date() })
      .where(eq(projectsTable.id, id));

  } catch (err) {
    console.error(`[tts-${id}] Edge TTS failed:`, err);
    await db.update(projectsTable)
      .set({ status: "scripting", updatedAt: new Date() })
      .where(eq(projectsTable.id, id));
  }
}

/** Preview: generate TTS for arbitrary text (no project needed) */
router.post("/tts/preview", async (req, res): Promise<void> => {
  const { text, voiceId = "en-US-AriaNeural", rate = "+0%", pitch = "+0Hz" } = req.body ?? {};
  if (!text?.trim()) { res.status(400).json({ error: "text required" }); return; }

  const tmpFile = `/tmp/tts-preview-${Date.now()}.mp3`;
  try {
    await execFileAsync(EDGE_TTS, [
      "--voice", voiceId, "--rate", rate, "--pitch", pitch,
      "--text", String(text).slice(0, 500),
      "--write-media", tmpFile,
    ], { timeout: 30_000 });

    const stat = await fs.promises.stat(tmpFile);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", stat.size);
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("end", () => fs.promises.unlink(tmpFile).catch(() => {}));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
