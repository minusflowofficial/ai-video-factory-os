import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(settingsTable);
  if (!settings) {
    const [created] = await db.insert(settingsTable).values({}).returning();
    settings = created;
  }
  res.json(serializeSettings(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [current] = await db.select().from(settingsTable);
  if (!current) {
    const [created] = await db.insert(settingsTable).values({}).returning();
    current = created;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.geminiKey) updateData.geminiKey = parsed.data.geminiKey;
  if (parsed.data.openaiKey) updateData.openaiKey = parsed.data.openaiKey;
  if (parsed.data.claudeKey) updateData.claudeKey = parsed.data.claudeKey;
  if (parsed.data.groqKey) updateData.groqKey = parsed.data.groqKey;
  if (parsed.data.pexelsKey) updateData.pexelsKey = parsed.data.pexelsKey;
  if (parsed.data.pixabayKey) updateData.pixabayKey = parsed.data.pixabayKey;
  if (parsed.data.unsplashKey) updateData.unsplashKey = parsed.data.unsplashKey;
  if (parsed.data.defaultAiProvider) updateData.defaultAiProvider = parsed.data.defaultAiProvider;
  if (parsed.data.defaultDuration) updateData.defaultDuration = parsed.data.defaultDuration;
  if (parsed.data.defaultAspectRatio) updateData.defaultAspectRatio = parsed.data.defaultAspectRatio;
  if (parsed.data.storageProvider) updateData.storageProvider = parsed.data.storageProvider;

  const [updated] = await db.update(settingsTable).set(updateData).returning();
  res.json(serializeSettings(updated));
});

function serializeSettings(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    geminiKeySet: !!s.geminiKey,
    openaiKeySet: !!s.openaiKey,
    claudeKeySet: !!s.claudeKey,
    groqKeySet: !!s.groqKey,
    pexelsKeySet: !!s.pexelsKey,
    pixabayKeySet: !!s.pixabayKey,
    unsplashKeySet: !!s.unsplashKey,
    defaultAiProvider: s.defaultAiProvider,
    defaultDuration: s.defaultDuration,
    defaultAspectRatio: s.defaultAspectRatio,
    storageProvider: s.storageProvider,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  };
}

export default router;
