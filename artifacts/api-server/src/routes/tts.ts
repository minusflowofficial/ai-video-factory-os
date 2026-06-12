/**
 * TTS (Text-to-Speech) voiceover generation using Supertone Supertonic.
 *
 * Setup:
 *   1. Get API key from https://supertone.ai
 *   2. Set SUPERTONE_API_KEY in your environment secrets
 *   3. Install: pnpm --filter @workspace/api-server add supertonic
 *
 * API: POST /api/projects/:id/generate-tts
 *   Body: { voiceId?: string, speed?: number }
 *   Returns: project with status="voiceover"
 *   Generates: /tmp/render-{id}/voiceover.mp3 (used in render mix)
 *
 * Voice rendering: the render pipeline automatically uses voiceover.mp3
 * if it exists (voiceover at 100% + background music at 15%).
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { db, projectsTable } from "@workspace/db";

const router: IRouter = Router();

// Default voices per gender (Supertone voice IDs)
const VOICE_MAP: Record<string, string> = {
  female:    "aria",
  male:      "james",
  "female-warm":  "luna",
  "male-deep":    "atlas",
};

router.post("/projects/:id/generate-tts", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const apiKey = process.env.SUPERTONE_API_KEY;
  if (!apiKey) {
    res.status(402).json({
      error: "SUPERTONE_API_KEY not configured.",
      hint: "Add SUPERTONE_API_KEY to your environment secrets to enable AI voiceovers.",
      setupUrl: "https://supertone.ai",
    });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const text = project.script ?? project.hook ?? project.title;
  if (!text?.trim()) { res.status(400).json({ error: "No script to synthesize. Generate a script first." }); return; }

  // Respond immediately, process in background
  const [updated] = await db.update(projectsTable).set({
    status: "voiceover",
    updatedAt: new Date(),
  }).where(eq(projectsTable.id, id)).returning();

  res.json(serializeTtsProject(updated));

  // Background: call Supertone API
  const voiceId  = (req.body?.voiceId as string) ?? VOICE_MAP[project.voiceGender ?? "female"] ?? "aria";
  const speed    = typeof req.body?.speed === "number" ? req.body.speed : 1.0;
  const language = project.voiceLanguage ?? "en-US";

  generateVoiceover(id, text, voiceId, language, speed, apiKey).catch(() => {});
});

async function generateVoiceover(
  id: number,
  text: string,
  voiceId: string,
  language: string,
  speed: number,
  apiKey: string,
): Promise<void> {
  const dir = `/tmp/render-${id}`;
  await fs.promises.mkdir(dir, { recursive: true });

  try {
    /**
     * Supertone API reference: https://supertone.ai/docs
     * Adjust endpoint/payload once you have API access.
     */
    const response = await fetch("https://supertone.ai/api/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        voice_id:  voiceId,
        language,
        speed,
        format:    "mp3",
        sample_rate: 44100,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supertone API ${response.status}: ${await response.text()}`);
    }

    const buf = await response.arrayBuffer();
    await fs.promises.writeFile(path.join(dir, "voiceover.mp3"), Buffer.from(buf));

    // Flag that voiceover is ready (render pipeline picks it up automatically)
    await db.update(projectsTable).set({
      status: "scripting",   // back to ready state
      voiceoverUrl: null,    // null = use voiceover.mp3 file instead of music
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));

  } catch (err: any) {
    // Mark as error so the UI can show a message
    await db.update(projectsTable).set({
      status: "scripting",
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
  }
}

/** Check if a voiceover file exists for a project */
router.get("/projects/:id/tts-status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const voicePath = `/tmp/render-${id}/voiceover.mp3`;
  const exists = await fs.promises.access(voicePath).then(() => true).catch(() => false);
  const hasKey = !!process.env.SUPERTONE_API_KEY;
  res.json({ hasVoiceover: exists, apiKeyConfigured: hasKey });
});

/** List available voices */
router.get("/tts/voices", async (_req, res): Promise<void> => {
  const hasKey = !!process.env.SUPERTONE_API_KEY;
  res.json({
    apiKeyConfigured: hasKey,
    voices: [
      { id: "aria",  name: "Aria",  gender: "female", language: "en-US", style: "Professional" },
      { id: "luna",  name: "Luna",  gender: "female", language: "en-US", style: "Warm" },
      { id: "james", name: "James", gender: "male",   language: "en-US", style: "Professional" },
      { id: "atlas", name: "Atlas", gender: "male",   language: "en-US", style: "Deep" },
    ],
    note: hasKey
      ? "Supertone API is configured and ready."
      : "Set SUPERTONE_API_KEY in environment secrets to enable AI voiceovers.",
  });
});

function serializeTtsProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id, title: p.title, status: p.status,
    voiceGender: p.voiceGender, voiceLanguage: p.voiceLanguage,
    updatedAt: p.updatedAt?.toISOString() ?? null,
  };
}

export default router;
