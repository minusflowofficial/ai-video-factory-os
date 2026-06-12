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
  ArrowLeft, Loader2, X, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

// Media proxy for Mixkit assets (bypasses CORS)
const proxyUrl = (url: string, dl = false) =>
  `/api/proxy/media?url=${encodeURIComponent(url)}${dl ? "&dl=1" : ""}`;

// For rendered output served directly from our own API (no proxy needed)
const isOwnApiUrl = (url?: string | null) => url?.startsWith("/api/") ?? false;

const MIXKIT_MUSIC = [
  { id: 738,  title: "Epic Cinematic Opener",   mood: "Dramatic",     dur: "2:14" },
  { id: 739,  title: "Inspiring Journey",        mood: "Uplifting",    dur: "2:32" },
  { id: 740,  title: "Corporate Success",         mood: "Professional", dur: "2:05" },
  { id: 741,  title: "Epic Motivation",           mood: "Energetic",    dur: "1:58" },
  { id: 837,  title: "Ambient Digital",           mood: "Chill",        dur: "3:12" },
  { id: 838,  title: "Digital Pulse",             mood: "Tech",         dur: "2:44" },
  { id: 843,  title: "Victory Fanfare",           mood: "Triumphant",   dur: "1:30" },
  { id: 872,  title: "Lo-Fi Afternoon",           mood: "Relaxed",      dur: "2:58" },
  { id: 873,  title: "Soft Background",           mood: "Subtle",       dur: "3:05" },
  { id: 912,  title: "Upbeat Pop Intro",          mood: "Fun",          dur: "1:45" },
];

const PIPELINE_STEPS = ["Generating script", "Fetching assets", "Matching music", "Rendering video"];

export default function StudioEditor() {
  const [, params] = useRoute("/studio/:id");
  const [, nav]    = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();

  // Poll every 1.2s while pipeline is running so UI stays live
  const { data: project, isLoading } = useGetProject(id, {
    query: {
      enabled: !!id,
      refetchInterval: (query) => {
        const s = (query.state.data as any)?.status as string | undefined;
        return (s === "rendering" || s === "scripting" || s === "fetching-assets" || s === "voiceover")
          ? 1200 : false;
      },
    },
  });

  const updateProject  = useUpdateProject();
  const genScript      = useGenerateScript();
  const genAssets      = useGenerateAssets();
  const genVoice       = useGenerateVoiceover();

  const [localScript,   setLocalScript]   = useState("");
  const [assetTab,      setAssetTab]      = useState<"videos" | "music">("videos");
  const [playingTrack,  setPlayingTrack]  = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [previewClip,   setPreviewClip]   = useState<any | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoStep,      setAutoStep]      = useState(-1);
  const [renderError,   setRenderError]   = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initRef  = useRef<number | null>(null);

  useEffect(() => {
    if (project && initRef.current !== project.id) {
      setLocalScript(project.script || "");
      initRef.current = project.id;
    }
  }, [project]);

  // Auto-clear running state when render completes
  useEffect(() => {
    if (project?.status === "completed" && isAutoRunning) {
      setIsAutoRunning(false);
      setAutoStep(-1);
    }
  }, [project?.status]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const setCache = (data: any) =>
    queryClient.setQueryData(getGetProjectQueryKey(id), data);

  // Single button — auto-chains all 4 pipeline steps, then kicks off real FFmpeg render
  const handleGenerateAll = () => {
    setIsAutoRunning(true);
    setAutoStep(0);
    setPreviewClip(null);
    setRenderError(null);

    genScript.mutate({ id }, {
      onSuccess: (d) => {
        setCache(d);
        setLocalScript(d.script || "");
        setAutoStep(1);

        genAssets.mutate({ id }, {
          onSuccess: (d) => {
            setCache(d);
            setAutoStep(2);

            genVoice.mutate({ id }, {
              onSuccess: (d) => {
                setCache(d);
                setAutoStep(3);

                // Direct fetch so we can include the selected music track
                fetch(`/api/projects/${id}/render`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ musicTrackId: selectedTrack ?? 738 }),
                })
                  .then(r => r.json())
                  .then(data => {
                    setCache(data);
                    // Polling loop above will detect "completed" automatically
                  })
                  .catch(() => {
                    setRenderError("Render request failed");
                    setIsAutoRunning(false);
                    setAutoStep(-1);
                  });
              },
              onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
            });
          },
          onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
        });
      },
      onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
    });
  };

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

  const handleSaveScript = () => {
    updateProject.mutate({ id, data: { script: localScript } }, { onSuccess: setCache });
  };

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

  const isCompleted = project.status === "completed";
  const isRendering = project.status === "rendering";
  const isRunning   = isAutoRunning || isRendering;

  // Video URL: own API endpoint (no proxy) or Mixkit (proxy)
  const rawVideoUrl = project.videoUrl ?? null;
  const finalVideoUrl = previewClip
    ? proxyUrl(previewClip.url)
    : rawVideoUrl
      ? (isOwnApiUrl(rawVideoUrl) ? rawVideoUrl : proxyUrl(rawVideoUrl))
      : null;

  const downloadUrl = rawVideoUrl
    ? (isOwnApiUrl(rawVideoUrl) ? `${rawVideoUrl}?dl=1` : proxyUrl(rawVideoUrl, true))
    : null;

  const renderPct = project.renderProgress ?? 0;

  return (
    <AppLayout>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header className="h-12 shrink-0 bg-white border-b border-gray-100 flex items-center gap-3 px-4">
          <button
            onClick={() => nav("/studio")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-gray-900 text-sm truncate">{project.title}</span>
            <StatusBadge status={project.status} />
          </div>
          <Button
            onClick={handleGenerateAll}
            disabled={isRunning}
            className="h-8 px-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs shrink-0"
          >
            {isRunning ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {PIPELINE_STEPS[autoStep] ?? "Rendering…"}</>
            ) : (
              <><Zap className="w-3.5 h-3.5 mr-1.5" />Generate Video</>
            )}
          </Button>
        </header>

        {/* ── Pipeline progress ─────────────────────────────────── */}
        {isRunning && (
          <div className="shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold",
                    i < autoStep   ? "bg-emerald-500 text-white" :
                    i === autoStep ? "bg-amber-400 text-amber-950 animate-pulse" :
                                     "bg-gray-200 text-gray-400"
                  )}>
                    {i < autoStep ? "✓" : i + 1}
                  </div>
                  <span className={cn(
                    "text-[10px] truncate",
                    i === autoStep ? "text-amber-700 font-semibold" :
                    i < autoStep   ? "text-emerald-600" : "text-gray-400"
                  )}>{step}</span>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="h-px bg-gray-200 flex-1 mx-0.5 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
            {/* Render progress bar */}
            {(isRendering || autoStep === 3) && (
              <div className="mt-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${renderPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium w-8 text-right">{renderPct}%</span>
                </div>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {renderPct < 70 ? "Downloading clips & music…" :
                   renderPct < 75 ? "Preparing FFmpeg render…" :
                   renderPct < 100 ? "Composing video — transitions, music, captions…" :
                   "Finalizing…"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 3-column body ────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Col 1: Script + Keywords + Scene Breakdown ──────────── */}
          <div className="flex-1 flex flex-col border-r border-gray-100 min-w-0">
            <div className="shrink-0 h-10 flex items-center justify-between px-4 border-b border-gray-100 bg-white">
              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> Script
              </span>
              <button
                onClick={handleSaveScript}
                disabled={updateProject.isPending}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
              >
                {updateProject.isPending && <RefreshCw className="w-3 h-3 animate-spin" />}
                Save
              </button>
            </div>

            <textarea
              value={localScript}
              onChange={e => setLocalScript(e.target.value)}
              placeholder={isRunning ? "Generating script…" : "Click 'Generate Video' to auto-generate, or type your script here…"}
              className="flex-1 w-full resize-none bg-white text-gray-800 p-4 text-sm leading-relaxed focus:outline-none placeholder:text-gray-300 font-mono"
            />

            {/* Keyword pills */}
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
              <div className="shrink-0 border-t border-gray-100 max-h-52 overflow-y-auto bg-gray-50">
                <div className="px-4 pt-2 pb-1 flex items-center gap-2">
                  <Film className="w-3 h-3 text-gray-400" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Scene Breakdown</p>
                </div>
                {scenes.map((scene, i) => (
                  <div key={i} className="mx-3 mb-2 p-2.5 bg-white rounded border border-gray-100 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold shrink-0">Scene {i + 1}</span>
                      <span className="text-gray-600 flex-1">{scene.visualIntent}</span>
                      <span className="text-gray-400 shrink-0 text-[9px]">{scene.duration}s</span>
                    </div>
                    {Array.isArray(scene.keywords) && scene.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-11">
                        {scene.keywords.map((kw: string, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded font-medium border border-blue-100">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Col 2: B-Roll + Music ───────────────────────────────── */}
          <div className="w-72 flex flex-col border-r border-gray-100 shrink-0">
            <div className="shrink-0 h-10 flex items-center gap-1 px-3 border-b border-gray-100 bg-white">
              <button
                onClick={() => setAssetTab("videos")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors",
                  assetTab === "videos" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" /> B-Roll
              </button>
              <button
                onClick={() => setAssetTab("music")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors",
                  assetTab === "music" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Music2 className="w-3.5 h-3.5" /> Music
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto bg-gray-50">
              {assetTab === "videos" ? (
                assets.length === 0 ? (
                  <div className="text-center py-10">
                    <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">
                      {isRunning ? "Fetching assets…" : "Click Generate Video to fetch B-roll clips."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-400">{assets.length} clips · click to preview in Output</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {assets.map((asset, i) => {
                        const isPreviewing = previewClip?.id === asset.id;
                        return (
                          <button
                            key={i}
                            onClick={() => setPreviewClip(isPreviewing ? null : asset)}
                            className={cn(
                              "aspect-video bg-gray-200 rounded overflow-hidden relative group cursor-pointer border-2 transition-all",
                              isPreviewing ? "border-amber-400" : "border-transparent hover:border-amber-200"
                            )}
                          >
                            <img
                              src={proxyUrl(asset.thumbnail)}
                              alt={`Clip ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={e => {
                                (e.target as HTMLImageElement).src =
                                  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='60'><rect fill='%23e5e7eb' width='100' height='60'/><text x='50' y='32' text-anchor='middle' fill='%236b7280' font-size='9'>Clip " + (i+1) + "</text></svg>";
                              }}
                            />
                            <div className={cn(
                              "absolute inset-0 flex items-center justify-center transition-opacity",
                              isPreviewing ? "bg-amber-400/30 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"
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
              ) : (
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 mb-2">▶ preview · click row to use in video</p>
                  {MIXKIT_MUSIC.map(track => {
                    const playing  = playingTrack  === track.id;
                    const selected = selectedTrack === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => setSelectedTrack(track.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors",
                          selected ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 hover:border-gray-200"
                        )}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); togglePlay(track.id); }}
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors",
                            playing ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          )}
                        >
                          {playing
                            ? <Pause className="w-2.5 h-2.5" fill="currentColor" />
                            : <Play  className="w-2.5 h-2.5" fill="currentColor" />}
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
          </div>

          {/* Col 3: Output ──────────────────────────────────────── */}
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
              {isCompleted && !previewClip && !isOwnApiUrl(rawVideoUrl) && (
                <span className="text-[9px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">Fallback</span>
              )}
              {isCompleted && !previewClip && isOwnApiUrl(rawVideoUrl) && (
                <span className="text-[9px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Rendered</span>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-hidden">
              {/* Video frame */}
              <div className={cn(
                "relative bg-gray-900 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center",
                project.aspectRatio === "9:16" ? "w-32 h-56" :
                project.aspectRatio === "1:1"  ? "w-44 h-44" : "w-full h-28"
              )}>
                {finalVideoUrl ? (
                  <>
                    <video
                      key={finalVideoUrl}
                      src={finalVideoUrl}
                      controls
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                    {/* Title overlay — only on final output, not b-roll preview */}
                    {!previewClip && project.title && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 pointer-events-none">
                        <p className="text-white text-[9px] font-bold text-center leading-tight line-clamp-2">
                          {project.title}
                        </p>
                      </div>
                    )}
                  </>
                ) : (isRendering || autoStep === 3) ? (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    <span className="text-[10px] text-gray-400 leading-tight">
                      {renderPct < 70 ? "Downloading clips…" :
                       renderPct < 75 ? "Starting FFmpeg…" :
                       "Compositing video…"}
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

              {/* Metadata */}
              <div className="w-full text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>{project.aspectRatio}</span>
                  <span>{project.duration}</span>
                </div>
                {selectedTrack && !previewClip && (
                  <div className="flex items-center gap-1 text-amber-600 bg-amber-50 rounded px-2 py-1 text-[10px]">
                    <Music2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{MIXKIT_MUSIC.find(t => t.id === selectedTrack)?.title}</span>
                  </div>
                )}
                {renderError && (
                  <p className="text-red-500 text-[10px]">{renderError}</p>
                )}
              </div>

              {/* Render info */}
              {isCompleted && !previewClip && isOwnApiUrl(rawVideoUrl) && (
                <div className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-[10px] text-emerald-700">
                  <p className="font-semibold">Real FFmpeg composition</p>
                  <p className="text-emerald-600 mt-0.5">4 clips · fade transitions · music · title + captions</p>
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
