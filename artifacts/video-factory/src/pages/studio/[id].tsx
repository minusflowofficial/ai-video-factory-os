import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetProject, useUpdateProject,
  useGenerateScript, useGenerateAssets, useGenerateVoiceover,
} from "@workspace/api-client-react";
import {
  Play, Download, Zap, RefreshCw, FileText, Music2,
  Image as ImageIcon, CheckCircle2, Video, Pause,
  ArrowLeft, Loader2, X, Film, Settings2, Mic,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

// ── Media helpers ──────────────────────────────────────────────────────────
const proxyUrl  = (url: string, dl = false) =>
  `/api/proxy/media?url=${encodeURIComponent(url)}${dl ? "&dl=1" : ""}`;
const isOwnUrl  = (url?: string | null): boolean => !!url?.startsWith("/api/");

// ── Music library ──────────────────────────────────────────────────────────
const MUSIC = [
  { id: 738,  title: "Epic Cinematic Opener",  mood: "Dramatic",     dur: "2:14" },
  { id: 739,  title: "Inspiring Journey",       mood: "Uplifting",    dur: "2:32" },
  { id: 740,  title: "Corporate Success",        mood: "Professional", dur: "2:05" },
  { id: 741,  title: "Epic Motivation",          mood: "Energetic",    dur: "1:58" },
  { id: 837,  title: "Ambient Digital",          mood: "Chill",        dur: "3:12" },
  { id: 838,  title: "Digital Pulse",            mood: "Tech",         dur: "2:44" },
  { id: 843,  title: "Victory Fanfare",          mood: "Triumphant",   dur: "1:30" },
  { id: 872,  title: "Lo-Fi Afternoon",          mood: "Relaxed",      dur: "2:58" },
  { id: 873,  title: "Soft Background",          mood: "Subtle",       dur: "3:05" },
  { id: 912,  title: "Upbeat Pop Intro",         mood: "Fun",          dur: "1:45" },
];

const TRANSITIONS = [
  { value: "fade",  label: "Fade",       hint: "Simple fade in/out per clip" },
  { value: "xfade", label: "Crossfade",  hint: "Smooth overlap between clips" },
  { value: "zoom",  label: "Ken Burns",  hint: "Alternating slow zoom in/out" },
] as const;

type TransitionEffect = "fade" | "xfade" | "zoom";
type CaptionStyle = "modern" | "bold-box" | "netflix" | "tiktok" | "cinematic" | "news" | "mrbeast" | "viral" | "gaming" | "highlight";

interface RenderOpts {
  showTitle:        boolean;
  showCaptions:     boolean;
  captionStyle:     CaptionStyle;
  transitionEffect: TransitionEffect;
  addSfx:           boolean;
}

const CAPTION_STYLES: { value: CaptionStyle; label: string; hint: string; previewText: string; previewClass: string }[] = [
  { value: "mrbeast",   label: "MrBeast",   hint: "Giant white text, center screen, thick black stroke",  previewText: "WOW!", previewClass: "text-white text-[11px] font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000,_0_0_6px_#000]" },
  { value: "viral",     label: "Viral",     hint: "Yellow text, black outline, center screen — Shorts/Reels", previewText: "CRAZY!", previewClass: "text-yellow-300 text-[11px] font-black [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000]" },
  { value: "tiktok",    label: "TikTok",    hint: "Large white, thick black outline — TikTok style",       previewText: "Abc",  previewClass: "text-white text-[10px] font-black [text-shadow:_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000,_1px_1px_0_#000]" },
  { value: "gaming",    label: "Gaming",    hint: "Neon cyan, dark box, glow — streamer/esports style",    previewText: "Abc",  previewClass: "text-cyan-300 text-[9px] font-bold bg-gray-900/80 px-0.5" },
  { value: "bold-box",  label: "Bold Box",  hint: "White on dark box — YouTube subtitle style",            previewText: "Abc",  previewClass: "text-white text-[9px] font-semibold bg-black/70 px-1" },
  { value: "netflix",   label: "Netflix",   hint: "White on solid black bar — Netflix subtitle style",     previewText: "Abc",  previewClass: "text-white text-[9px] bg-black px-1" },
  { value: "highlight", label: "Highlight", hint: "White on amber box — tutorial/educational style",       previewText: "Abc",  previewClass: "text-white text-[9px] font-semibold bg-amber-600 px-1" },
  { value: "cinematic", label: "Cinematic", hint: "Gold text on dark bar — movie/cinematic style",         previewText: "Abc",  previewClass: "text-amber-300 text-[9px] bg-gray-900/80 px-1" },
  { value: "modern",    label: "Modern",    hint: "White text, drop shadow only — minimal clean look",     previewText: "Abc",  previewClass: "text-white text-[9px] drop-shadow-lg" },
  { value: "news",      label: "News",      hint: "Black text on yellow ticker strip",                     previewText: "Abc",  previewClass: "text-black text-[9px] font-bold bg-yellow-400 px-1" },
];

const SCRIPTED_STEPS    = ["Generating script", "Fetching assets", "Matching music", "Rendering video"];
const SATISFYING_STEPS  = ["Fetching assets", "Matching music", "Rendering video"];

// ── Toggle component ───────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border transition-colors",
        value
          ? "bg-amber-50 border-amber-300 text-amber-700"
          : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300",
      )}
    >
      {value ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {value ? "On" : "Off"}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function StudioEditor() {
  const [, params] = useRoute("/studio/:id");
  const [, nav]    = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const qc = useQueryClient();

  const { data: project, isLoading } = useGetProject(id, {
    query: {
      queryKey: getGetProjectQueryKey(id),
      enabled: !!id,
      refetchInterval: (query) => {
        const s = (query.state.data as any)?.status as string | undefined;
        return ["rendering", "scripting", "fetching-assets", "voiceover", "assets-ready", "music-ready"].includes(s ?? "")
          ? 1200 : false;
      },
    },
  });

  const updateProject  = useUpdateProject();
  const genScript      = useGenerateScript();
  const genAssets      = useGenerateAssets();
  const genVoice       = useGenerateVoiceover();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [localScript,   setLocalScript]   = useState("");
  const [assetTab,      setAssetTab]      = useState<"videos" | "music" | "voice">("videos");
  const [playingTrack,  setPlayingTrack]  = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [previewClip,   setPreviewClip]   = useState<any | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoStep,      setAutoStep]      = useState(-1);
  const [renderError,   setRenderError]   = useState<string | null>(null);
  const [renderOpts, setRenderOpts] = useState<RenderOpts>({
    showTitle:        false,
    showCaptions:     false,
    captionStyle:     "bold-box",
    transitionEffect: "xfade",
    addSfx:           false,
  });
  const [showMusicLibrary, setShowMusicLibrary] = useState(false);

  // Music+visuals only — no text overlays. Skips script generation step.
  const isSatisfyingMode = !renderOpts.showTitle && !renderOpts.showCaptions;

  // Derive used music track from project.voiceoverUrl (e.g. "…/music/872/872.mp3" → 872)
  const usedMusicId    = (() => {
    const m = (project?.voiceoverUrl ?? "").match(/\/music\/(\d+)\/\d+\.mp3/);
    return m ? parseInt(m[1], 10) : null;
  })();
  const usedMusicTrack = usedMusicId ? MUSIC.find(t => t.id === usedMusicId) : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initRef  = useRef<number | null>(null);

  useEffect(() => {
    if (project && initRef.current !== project.id) {
      setLocalScript(project.script || "");
      initRef.current = project.id;
    }
  }, [project]);

  useEffect(() => {
    if ((project?.status === "completed" || project?.status === "error") && isAutoRunning) {
      setIsAutoRunning(false);
      setAutoStep(-1);
    }
  }, [project?.status]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const setCache = (data: any) =>
    qc.setQueryData(getGetProjectQueryKey(id), data);

  // ── "Satisfying video" preset ─────────────────────────────────────────────
  const applySatisfyingPreset = () => {
    setRenderOpts({
      showTitle:        false,
      showCaptions:     false,
      captionStyle:     "bold-box",
      transitionEffect: "zoom",
      addSfx:           false,
    });
    if (!selectedTrack) setSelectedTrack(872);
  };

  const applyScriptedPreset = () => {
    setRenderOpts({
      showTitle:        true,
      showCaptions:     true,
      captionStyle:     "bold-box",
      transitionEffect: "xfade",
      addSfx:           true,
    });
  };

  // ── Shared render fetch ───────────────────────────────────────────────────
  const doRender = () => {
    fetch(`/api/projects/${id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        musicTrackId:     selectedTrack ?? 738,
        showTitle:        renderOpts.showTitle,
        showCaptions:     renderOpts.showCaptions,
        captionStyle:     renderOpts.captionStyle,
        transitionEffect: renderOpts.transitionEffect,
        addSfx:           renderOpts.addSfx,
      }),
    })
      .then(r => r.json())
      .then(data => setCache(data))
      .catch(() => {
        setRenderError("Render failed. Please try again.");
        setIsAutoRunning(false);
        setAutoStep(-1);
      });
  };

  // ── Auto-pipeline ─────────────────────────────────────────────────────────
  const handleGenerateAll = () => {
    setIsAutoRunning(true);
    setAutoStep(0);
    setPreviewClip(null);
    setRenderError(null);

    const runAssetsAndRender = (stepOffset: number) => {
      genAssets.mutate({ id }, {
        onSuccess: (d) => {
          setCache(d);
          setAutoStep(stepOffset + 1);

          genVoice.mutate({ id }, {
            onSuccess: (d) => {
              setCache(d);
              setAutoStep(stepOffset + 2);
              doRender();
            },
            onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
          });
        },
        onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
      });
    };

    if (isSatisfyingMode) {
      // Satisfying / music-only: skip script generation
      runAssetsAndRender(0);
    } else {
      // Scripted: generate script first
      genScript.mutate({ id }, {
        onSuccess: (d) => {
          setCache(d);
          setLocalScript(d.script || "");
          setAutoStep(1);
          runAssetsAndRender(1);
        },
        onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
      });
    }
  };

  // ── Re-render only (no pipeline) ─────────────────────────────────────────
  const handleRerender = () => {
    setRenderError(null);
    fetch(`/api/projects/${id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        musicTrackId:     selectedTrack ?? undefined,
        showTitle:        renderOpts.showTitle,
        showCaptions:     renderOpts.showCaptions,
        captionStyle:     renderOpts.captionStyle,
        transitionEffect: renderOpts.transitionEffect,
        addSfx:           renderOpts.addSfx,
      }),
    })
      .then(r => r.json())
      .then(setCache)
      .catch(() => setRenderError("Render failed."));
  };

  // ── Music preview ─────────────────────────────────────────────────────────
  const togglePlay = (trackId: number) => {
    const url = proxyUrl(`https://assets.mixkit.co/music/${trackId}/${trackId}.mp3`);
    if (playingTrack === trackId) {
      audioRef.current?.pause();
      setPlayingTrack(null);
    } else {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
      audioRef.current.onended = () => setPlayingTrack(null);
      setPlayingTrack(trackId);
    }
  };

  // ── TTS voiceover ─────────────────────────────────────────────────────────
  const handleGenerateTTS = () => {
    fetch(`/api/projects/${id}/generate-tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) alert(`${data.error}\n\n${data.hint ?? ""}`);
        else setCache(data);
      });
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading || !project) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  let scenes:   any[]    = [];
  let assets:   any[]    = [];
  let keywords: string[] = [];
  try { if (project.scenes)   scenes   = JSON.parse(project.scenes); }   catch (_) {}
  try { if (project.assets)   assets   = JSON.parse(project.assets); }   catch (_) {}
  try { if (project.keywords) keywords = JSON.parse(project.keywords); } catch (_) {}

  const isCompleted  = project.status === "completed";
  const isRendering  = project.status === "rendering";
  const isError      = project.status === "error";
  const isRunning    = isAutoRunning || isRendering;
  const renderPct    = project.renderProgress ?? 0;
  const PIPELINE_STEPS = isSatisfyingMode ? SATISFYING_STEPS : SCRIPTED_STEPS;

  const rawVideoUrl  = project.videoUrl ?? null;
  const finalVideoUrl = previewClip
    ? proxyUrl(previewClip.url)
    : rawVideoUrl
      ? (isOwnUrl(rawVideoUrl) ? rawVideoUrl : proxyUrl(rawVideoUrl))
      : null;
  const downloadUrl = rawVideoUrl
    ? (isOwnUrl(rawVideoUrl) ? `${rawVideoUrl}?dl=1` : proxyUrl(rawVideoUrl, true))
    : null;

  return (
    <AppLayout>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="h-12 shrink-0 bg-white border-b border-gray-100 flex items-center gap-3 px-4">
          <button
            onClick={() => nav("/studio")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-gray-900 text-sm truncate">{project.title}</span>
            <StatusBadge status={project.status} />
          </div>
          {(isCompleted || isError) && !isRunning && (
            <button
              onClick={handleRerender}
              className={cn(
                "text-xs flex items-center gap-1 mr-1",
                isError
                  ? "text-red-500 hover:text-red-700 font-medium"
                  : "text-gray-500 hover:text-gray-700",
              )}
              title="Re-render with current options"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {isError ? "Retry render" : "Re-render"}
            </button>
          )}
          <Button
            onClick={handleGenerateAll}
            disabled={isRunning}
            className="h-8 px-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs shrink-0"
          >
            {isRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{PIPELINE_STEPS[autoStep] ?? "Rendering…"}</>
            ) : (
              <><Zap className="w-3.5 h-3.5 mr-1.5" />Generate Video</>
            )}
          </Button>
        </header>

        {/* ── Pipeline progress ─────────────────────────────────────────── */}
        {isRunning && (
          <div className="shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold",
                    i < autoStep   ? "bg-emerald-500 text-white" :
                    i === autoStep ? "bg-amber-400 text-amber-950 animate-pulse" :
                                     "bg-gray-200 text-gray-400",
                  )}>
                    {i < autoStep ? "✓" : i + 1}
                  </div>
                  <span className={cn(
                    "text-[10px] truncate",
                    i === autoStep ? "text-amber-700 font-semibold" :
                    i < autoStep   ? "text-emerald-600" : "text-gray-400",
                  )}>{step}</span>
                  {i < PIPELINE_STEPS.length - 1 && <div className="h-px bg-gray-200 flex-1 mx-0.5 hidden sm:block" />}
                </div>
              ))}
            </div>
            {(isRendering || autoStep === 3) && (
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${renderPct}%` }} />
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium w-8 text-right">{renderPct}%</span>
                </div>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {renderPct < 70 ? "Downloading clips & music…" :
                   renderPct < 75 ? "Preparing FFmpeg pipeline…" :
                   "Compositing video — transitions, captions, music…"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 3-column layout ───────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Col 1 — Script + Keywords + Scenes + Options ────────────────── */}
          <div className="flex-1 flex flex-col border-r border-gray-100 min-w-0">
            {/* Script header */}
            <div className="shrink-0 h-10 flex items-center justify-between px-4 border-b border-gray-100 bg-white">
              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                {isSatisfyingMode ? "Music & Visuals" : "Script"}
              </span>
              {!isSatisfyingMode && (
                <button
                  onClick={() => updateProject.mutate({ id, data: { script: localScript } }, { onSuccess: setCache })}
                  disabled={updateProject.isPending}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                >
                  {updateProject.isPending && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              )}
            </div>

            {isSatisfyingMode ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-blue-50/30">
                <Music2 className="w-10 h-10 text-blue-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700 mb-1">Music & Visuals only</p>
                <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed">
                  No script needed. The video will be pure visuals with background music and smooth Ken Burns transitions.
                </p>
                <p className="text-[10px] text-blue-500 mt-3 border border-blue-100 bg-blue-50 rounded-full px-3 py-1">
                  Switch to Scripted mode to add narration
                </p>
              </div>
            ) : (
              <textarea
                value={localScript}
                onChange={e => setLocalScript(e.target.value)}
                placeholder={isRunning ? "Generating script…" : "Click 'Generate Video' or type your script here…"}
                className="flex-1 w-full resize-none bg-white text-gray-800 p-4 text-sm leading-relaxed focus:outline-none placeholder:text-gray-300 font-mono"
              />
            )}

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className="shrink-0 px-4 py-2 border-t border-gray-100 flex flex-wrap gap-1.5 bg-gray-50">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mr-1 self-center">Keywords</span>
                {keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Scene breakdown */}
            {scenes.length > 0 && (
              <div className="shrink-0 border-t border-gray-100 max-h-44 overflow-y-auto bg-gray-50">
                <div className="px-4 pt-2 pb-1 flex items-center gap-2">
                  <Film className="w-3 h-3 text-gray-400" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Scene Breakdown</p>
                </div>
                {scenes.map((scene, i) => (
                  <div key={i} className="mx-3 mb-2 p-2 bg-white rounded border border-gray-100 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold shrink-0">S{i + 1}</span>
                      <span className="text-gray-600 flex-1 truncate">{scene.visualIntent}</span>
                      <span className="text-gray-400 shrink-0 text-[9px]">{scene.duration}s</span>
                    </div>
                    {Array.isArray(scene.keywords) && (
                      <div className="flex flex-wrap gap-1 mt-1 ml-5">
                        {scene.keywords.map((kw: string, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded font-medium border border-blue-100">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Video Options panel ────────────────────────────────────── */}
            <div className="shrink-0 border-t border-gray-100 bg-white">
              <div className="px-4 pt-2.5 pb-1 flex items-center gap-2">
                <Settings2 className="w-3 h-3 text-gray-400" />
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex-1">Video Options</p>
                {/* Preset buttons */}
                <button
                  onClick={applyScriptedPreset}
                  className="text-[9px] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-medium hover:bg-amber-100"
                >
                  Scripted
                </button>
                <button
                  onClick={applySatisfyingPreset}
                  className="text-[9px] px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100"
                >
                  Satisfying
                </button>
              </div>

              <div className="px-4 pb-3 space-y-2">
                {/* Title overlay toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-600">Title overlay (first 3.5s)</span>
                  <Toggle value={renderOpts.showTitle} onChange={v => setRenderOpts(o => ({ ...o, showTitle: v }))} />
                </div>

                {/* Captions toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-600">Captions per scene</span>
                  <Toggle value={renderOpts.showCaptions} onChange={v => setRenderOpts(o => ({ ...o, showCaptions: v }))} />
                </div>

                {/* Caption style picker — visible only when captions are ON */}
                {renderOpts.showCaptions && (
                  <div className="pl-3 border-l-2 border-amber-100 space-y-1.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Caption style</p>
                    <div className="grid grid-cols-2 gap-1">
                      {CAPTION_STYLES.map(s => {
                        const active = renderOpts.captionStyle === s.value;
                        return (
                          <button
                            key={s.value}
                            title={s.hint}
                            onClick={() => setRenderOpts(o => ({ ...o, captionStyle: s.value }))}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all",
                              active
                                ? "bg-amber-50 border-amber-400 ring-1 ring-amber-300"
                                : "bg-white border-gray-200 hover:border-gray-300",
                            )}
                          >
                            {/* Mini video frame preview */}
                            <div className="w-10 h-6 shrink-0 bg-gray-700 rounded overflow-hidden flex items-center justify-center">
                              <span className={cn("text-center leading-none px-0.5", s.previewClass)}>
                                {s.previewText}
                              </span>
                            </div>
                            <span className={cn(
                              "text-[9px] font-semibold truncate",
                              active ? "text-amber-700" : "text-gray-600",
                            )}>
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Transition SFX toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-600">Transition sound effects</span>
                  <Toggle value={renderOpts.addSfx} onChange={v => setRenderOpts(o => ({ ...o, addSfx: v }))} />
                </div>

                {/* Transition type */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 mr-auto">Transition style</span>
                  {TRANSITIONS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setRenderOpts(o => ({ ...o, transitionEffect: t.value }))}
                      title={t.hint}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors",
                        renderOpts.transitionEffect === t.value
                          ? "bg-gray-800 border-gray-800 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-400",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Col 2 — B-Roll / Music / Voice ──────────────────────────────── */}
          <div className="w-72 flex flex-col border-r border-gray-100 shrink-0">
            <div className="shrink-0 h-10 flex items-center gap-1 px-2 border-b border-gray-100 bg-white">
              {(["videos", "music", "voice"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAssetTab(tab)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 h-7 rounded text-[10px] font-medium transition-colors",
                    assetTab === tab ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  {tab === "videos" && <><ImageIcon className="w-3 h-3" />B-Roll</>}
                  {tab === "music"  && <><Music2    className="w-3 h-3" />Music</>}
                  {tab === "voice"  && <><Mic       className="w-3 h-3" />Voice</>}
                </button>
              ))}
            </div>

            <div className="flex-1 p-3 overflow-y-auto bg-gray-50">

              {/* ── B-Roll tab ─────────────────────────────────────────── */}
              {assetTab === "videos" && (
                assets.length === 0 ? (
                  <div className="text-center py-10">
                    <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">{isRunning ? "Fetching assets…" : "Click Generate Video to load B-roll clips."}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-400">{assets.length} clips · click to preview</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {assets.map((asset, i) => {
                        const isPrev = previewClip?.id === asset.id;
                        return (
                          <button
                            key={i}
                            onClick={() => setPreviewClip(isPrev ? null : asset)}
                            className={cn(
                              "aspect-video bg-gray-200 rounded overflow-hidden relative group border-2 transition-all",
                              isPrev ? "border-amber-400" : "border-transparent hover:border-amber-200",
                            )}
                          >
                            <img
                              src={proxyUrl(asset.thumbnail)}
                              alt={`Clip ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={e => {
                                (e.target as HTMLImageElement).src =
                                  `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='68'><rect fill='%23e5e7eb' width='120' height='68'/><text x='60' y='36' text-anchor='middle' fill='%236b7280' font-size='9'>Clip ${i+1}</text></svg>`;
                              }}
                            />
                            <div className={cn(
                              "absolute inset-0 flex items-center justify-center transition-opacity",
                              isPrev ? "bg-amber-400/30 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100",
                            )}>
                              <Play className="w-5 h-5 text-white drop-shadow" fill="white" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                              <span className="text-[9px] text-white truncate block">{asset.keyword}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              {/* ── Music tab ──────────────────────────────────────────── */}
              {assetTab === "music" && (
                <div className="space-y-2">
                  {/* Used track — derived at component level from project.voiceoverUrl */}
                  {usedMusicId && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Used in this video</p>
                      <div
                        onClick={() => setSelectedTrack(usedMusicId)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors",
                          selectedTrack === usedMusicId || selectedTrack === null
                            ? "bg-amber-50 border-amber-300"
                            : "bg-white border-gray-100 hover:border-gray-200",
                        )}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); togglePlay(usedMusicId); }}
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors",
                            playingTrack === usedMusicId ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                          )}
                        >
                          {playingTrack === usedMusicId
                            ? <Pause className="w-2.5 h-2.5" fill="currentColor" />
                            : <Play  className="w-2.5 h-2.5" fill="currentColor" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">
                            {usedMusicTrack?.title ?? `Track #${usedMusicId}`}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {usedMusicTrack ? `${usedMusicTrack.mood} · ${usedMusicTrack.dur}` : "Mixkit track"}
                          </p>
                        </div>
                        {(selectedTrack === usedMusicId || selectedTrack === null) && (
                          <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Toggle to show full library */}
                  <button
                    onClick={() => setShowMusicLibrary(v => !v)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Music2 className="w-3 h-3" />
                    {showMusicLibrary ? "Hide library" : "Change music…"}
                  </button>

                  {/* Full library — collapsed by default when used track is known */}
                  {(showMusicLibrary || !usedMusicId) && (
                    <div className="space-y-1">
                      {!usedMusicId && <p className="text-[10px] text-gray-400">▶ preview · click to select</p>}
                      {MUSIC.map(track => {
                        const playing  = playingTrack  === track.id;
                        const selected = selectedTrack === track.id;
                        return (
                          <div
                            key={track.id}
                            onClick={() => setSelectedTrack(track.id)}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors",
                              selected ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 hover:border-gray-200",
                            )}
                          >
                            <button
                              onClick={e => { e.stopPropagation(); togglePlay(track.id); }}
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                playing ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                              )}
                            >
                              {playing ? <Pause className="w-2.5 h-2.5" fill="currentColor" /> : <Play className="w-2.5 h-2.5" fill="currentColor" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{track.title}</p>
                              <p className="text-[10px] text-gray-400">{track.mood} · {track.dur}</p>
                            </div>
                            {selected && <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Voice tab ──────────────────────────────────────────── */}
              {assetTab === "voice" && (
                <div className="space-y-3">
                  <div className="bg-white border border-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-2">
                    <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-amber-500" /> AI Voiceover
                    </p>
                    <p>Generates a realistic voiceover from your script using Supertone's voice AI.</p>
                    <p className="text-[10px] text-gray-400">Requires <code className="bg-gray-100 px-1 rounded">SUPERTONE_API_KEY</code> environment variable.</p>
                    <button
                      onClick={handleGenerateTTS}
                      className="w-full h-8 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" /> Generate Voiceover
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Available Voices</p>
                    {[
                      { id: "aria",  name: "Aria",  gender: "Female", style: "Professional", lang: "en-US" },
                      { id: "luna",  name: "Luna",  gender: "Female", style: "Warm",         lang: "en-US" },
                      { id: "james", name: "James", gender: "Male",   style: "Professional", lang: "en-US" },
                      { id: "atlas", name: "Atlas", gender: "Male",   style: "Deep",         lang: "en-US" },
                    ].map(v => (
                      <div key={v.id} className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-lg text-xs">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white font-bold text-[10px]">
                          {v.name[0]}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{v.name}</p>
                          <p className="text-[10px] text-gray-400">{v.gender} · {v.style} · {v.lang}</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-400 pt-1">More voices and languages available at supertone.ai</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Col 3 — Output ───────────────────────────────────────────────── */}
          <div className="w-72 flex flex-col bg-gray-50 shrink-0">
            <div className="shrink-0 h-10 flex items-center px-4 border-b border-gray-100 bg-white gap-2">
              <Video className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700 flex-1">
                {previewClip ? "B-Roll Preview" : "Output"}
              </span>
              {previewClip && (
                <button onClick={() => setPreviewClip(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {isCompleted && !previewClip && (
                <span className={cn(
                  "text-[9px] font-medium px-2 py-0.5 rounded-full",
                  isOwnUrl(rawVideoUrl) ? "text-emerald-600 bg-emerald-50" : "text-yellow-600 bg-yellow-50",
                )}>
                  {isOwnUrl(rawVideoUrl) ? "Rendered" : "Fallback"}
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-y-auto">
              {/* Video frame — use object-contain so text overlays are never cropped */}
              <div className={cn(
                "relative bg-gray-900 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center",
                project.aspectRatio === "9:16" ? "w-32 h-56" :
                project.aspectRatio === "1:1"  ? "w-44 h-44" : "w-full h-28",
              )}>
                {finalVideoUrl ? (
                  <>
                    <video
                      key={finalVideoUrl}
                      src={finalVideoUrl}
                      controls
                      className="w-full h-full object-contain bg-black"
                      crossOrigin="anonymous"
                    />
                    {/* Visual title preview (overlay on top of video player for reference) */}
                    {!previewClip && renderOpts.showTitle && project.title && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 pointer-events-none">
                        <p className="text-white text-[9px] font-bold text-center leading-tight line-clamp-1">{project.title}</p>
                      </div>
                    )}
                  </>
                ) : (isRendering || autoStep === 3) ? (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    <span className="text-[10px] text-gray-400 leading-tight">
                      {renderPct < 70 ? "Downloading clips…" :
                       renderPct < 75 ? "Starting FFmpeg…" : "Compositing…"}
                    </span>
                    {renderPct > 0 && (
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${renderPct}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-3">
                    <Play className="w-6 h-6 text-gray-600 mx-auto" />
                    <p className="text-[10px] text-gray-500 mt-1">No video yet</p>
                  </div>
                )}
              </div>

              {/* Meta + options summary */}
              <div className="w-full text-xs text-gray-500 space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span>{project.aspectRatio}</span>
                  <span>{project.duration}</span>
                </div>

                {/* Active options summary */}
                <div className="flex flex-wrap gap-1">
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded border font-medium",
                    renderOpts.transitionEffect === "xfade" ? "bg-blue-50 border-blue-200 text-blue-700" :
                    renderOpts.transitionEffect === "zoom"  ? "bg-purple-50 border-purple-200 text-purple-700" :
                                                               "bg-gray-50 border-gray-200 text-gray-600",
                  )}>
                    {TRANSITIONS.find(t => t.value === renderOpts.transitionEffect)?.label}
                  </span>
                  {renderOpts.showTitle    && <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 font-medium">Title</span>}
                  {renderOpts.showCaptions && <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 font-medium">Captions</span>}
                  {renderOpts.addSfx       && <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700 font-medium">SFX</span>}
                </div>

                {selectedTrack && !previewClip && (
                  <div className="flex items-center gap-1 text-amber-600 bg-amber-50 rounded px-2 py-1 text-[10px]">
                    <Music2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{MUSIC.find(t => t.id === selectedTrack)?.title}</span>
                  </div>
                )}

                {renderError && (
                  <p className="text-red-500 text-[10px] bg-red-50 px-2 py-1 rounded">{renderError}</p>
                )}
              </div>

              {/* Error state */}
              {isError && !previewClip && (
                <div className="w-full bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[10px] text-red-700">
                  <p className="font-semibold">Render failed</p>
                  <p className="text-red-500 mt-0.5">
                    Check server logs for details. Click "Retry render" to try again.
                  </p>
                </div>
              )}

              {/* Composition details */}
              {isCompleted && !previewClip && isOwnUrl(rawVideoUrl) && (
                <div className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-[10px] text-emerald-700">
                  <p className="font-semibold">Real FFmpeg composition</p>
                  <p className="text-emerald-600 mt-0.5">
                    {assets.length} clips · {TRANSITIONS.find(t => t.value === renderOpts.transitionEffect)?.label ?? "transitions"}
                    {renderOpts.showTitle    && " · title"}
                    {renderOpts.showCaptions && " · captions"}
                    {renderOpts.addSfx       && " · SFX"}
                    {" · music"}
                  </p>
                </div>
              )}

              {/* Download */}
              {downloadUrl && !previewClip && (
                <a
                  href={downloadUrl}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download MP4
                </a>
              )}
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
