import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetProject, useUpdateProject, useGenerateScript,
  useGenerateAssets, useGenerateVoiceover, useRenderProject,
} from "@workspace/api-client-react";
import {
  Play, Download, Zap, RefreshCw, FileText, Music2,
  Image as ImageIcon, CheckCircle2, Video, Pause, ArrowLeft, Loader2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

// All media served through backend proxy to bypass Mixkit CORS restrictions
const proxyUrl = (url: string, dl = false) =>
  `/api/proxy/media?url=${encodeURIComponent(url)}${dl ? "&dl=1" : ""}`;

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

const PIPELINE_STEPS = ["Generating script", "Fetching assets", "Generating voice", "Rendering video"];

export default function StudioEditor() {
  const [, params] = useRoute("/studio/:id");
  const [, nav] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();

  // Auto-poll while rendering so UI picks up "completed" status after 800 ms
  const { data: project, isLoading } = useGetProject(id, {
    query: {
      enabled: !!id,
      refetchInterval: (query) => {
        const status = (query.state.data as any)?.status;
        return status === "rendering" || status === "fetching-assets" || status === "voiceover" || status === "scripting" ? 1200 : false;
      },
    },
  });

  const updateProject = useUpdateProject();
  const genScript  = useGenerateScript();
  const genAssets  = useGenerateAssets();
  const genVoice   = useGenerateVoiceover();
  const renderVid  = useRenderProject();

  const [localScript,  setLocalScript]  = useState("");
  const [assetTab,     setAssetTab]     = useState<"videos" | "music">("videos");
  const [playingTrack, setPlayingTrack] = useState<number | null>(null);
  const [selectedTrack,setSelectedTrack]= useState<number | null>(null);
  const [previewClip,  setPreviewClip]  = useState<any | null>(null); // B-roll clip being previewed
  const [isAutoRunning,setIsAutoRunning]= useState(false);
  const [autoStep,     setAutoStep]     = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initRef  = useRef<number | null>(null);

  useEffect(() => {
    if (project && initRef.current !== project.id) {
      setLocalScript(project.script || "");
      initRef.current = project.id;
    }
  }, [project]);

  // When project becomes "completed" after rendering, clear auto-running state
  useEffect(() => {
    if (project?.status === "completed" && isAutoRunning) {
      setIsAutoRunning(false);
      setAutoStep(-1);
    }
  }, [project?.status]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const setCache = (data: any) => queryClient.setQueryData(getGetProjectQueryKey(id), data);

  // Single-click: auto-chain the entire pipeline
  const handleGenerateAll = () => {
    setIsAutoRunning(true);
    setAutoStep(0);
    setPreviewClip(null);

    genScript.mutate({ id }, {
      onSuccess: (data) => {
        setCache(data);
        setLocalScript(data.script || "");
        setAutoStep(1);
        genAssets.mutate({ id }, {
          onSuccess: (data) => {
            setCache(data);
            setAutoStep(2);
            genVoice.mutate({ id }, {
              onSuccess: (data) => {
                setCache(data);
                setAutoStep(3);
                renderVid.mutate({ id }, {
                  onSuccess: (data) => {
                    setCache(data);
                    // Status will flip to "completed" after 800ms; poll detects it
                  },
                  onError: () => { setIsAutoRunning(false); setAutoStep(-1); },
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

  // Music preview via proxy
  const togglePlay = (trackId: number) => {
    const rawUrl = `https://assets.mixkit.co/music/${trackId}/${trackId}.mp3`;
    const url = proxyUrl(rawUrl);
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

  let scenes: any[]  = [];
  let assets: any[]  = [];
  let keywords: string[] = [];
  try { if (project.scenes)   scenes   = JSON.parse(project.scenes); }   catch (_) {}
  try { if (project.assets)   assets   = JSON.parse(project.assets); }   catch (_) {}
  try { if (project.keywords) keywords = JSON.parse(project.keywords); } catch (_) {}

  const isCompleted  = project.status === "completed";
  const isRendering  = project.status === "rendering";
  const outputVideoUrl = previewClip
    ? proxyUrl(previewClip.url)
    : project.videoUrl ? proxyUrl(project.videoUrl) : null;
  const downloadUrl  = project.videoUrl ? proxyUrl(project.videoUrl, true) : null;

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
            disabled={isAutoRunning || isRendering}
            className="h-8 px-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs shrink-0"
          >
            {isAutoRunning || isRendering ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {PIPELINE_STEPS[autoStep] ?? "Rendering…"}</>
            ) : (
              <><Zap className="w-3.5 h-3.5 mr-1.5" />Generate Video</>
            )}
          </Button>
        </header>

        {/* ── Pipeline progress bar (auto-run only) ─────────────── */}
        {(isAutoRunning || isRendering) && (
          <div className="shrink-0 bg-amber-50 border-b border-amber-100 px-6 py-2">
            <div className="flex items-center gap-2 max-w-3xl">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                    i < autoStep   ? "bg-emerald-500 text-white" :
                    i === autoStep ? "bg-amber-400 text-amber-950 animate-pulse" :
                                     "bg-gray-200 text-gray-400"
                  )}>
                    {i < autoStep ? "✓" : i + 1}
                  </div>
                  <span className={cn(
                    "text-xs truncate",
                    i === autoStep ? "text-amber-700 font-medium" :
                    i < autoStep   ? "text-emerald-600"           : "text-gray-400"
                  )}>{step}</span>
                  {i < PIPELINE_STEPS.length - 1 && <div className="h-px flex-1 bg-gray-200 mx-1 shrink-0 w-4" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3-column body ────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Col 1: Script ─────────────────────────────────────── */}
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
                {updateProject.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                Save
              </button>
            </div>

            <textarea
              value={localScript}
              onChange={e => setLocalScript(e.target.value)}
              placeholder={isAutoRunning ? "Generating script…" : "Click 'Generate Video' to auto-generate, or type your script here…"}
              className="flex-1 w-full resize-none bg-white text-gray-800 p-4 text-sm leading-relaxed focus:outline-none placeholder:text-gray-300 font-mono"
            />

            {/* Keywords pills */}
            {keywords.length > 0 && (
              <div className="shrink-0 px-4 py-2 border-t border-gray-100 flex flex-wrap gap-1.5 bg-gray-50">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1 self-center">Keywords</span>
                {keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Scene breakdown with per-scene keywords */}
            {scenes.length > 0 && (
              <div className="shrink-0 border-t border-gray-100 max-h-52 overflow-y-auto bg-gray-50">
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Scene Breakdown</p>
                </div>
                {scenes.map((scene, i) => (
                  <div key={i} className="mx-3 mb-2 p-2.5 bg-white rounded border border-gray-100 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold shrink-0">Scene {i + 1}</span>
                      <span className="text-gray-600 flex-1">{scene.visualIntent}</span>
                    </div>
                    {Array.isArray(scene.keywords) && scene.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-11">
                        {scene.keywords.map((kw: string, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded font-medium border border-blue-100">
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

          {/* Col 2: Assets (B-Roll + Music) ─────────────────────── */}
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
                      {isAutoRunning ? "Fetching assets…" : "Click Generate Video to fetch B-roll clips."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">{assets.length} Mixkit clips — click to preview</p>
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
                              onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='60'><rect fill='%23e5e7eb' width='100' height='60'/><text x='50' y='30' text-anchor='middle' dy='.3em' fill='%236b7280' font-size='10'>No preview</text></svg>"; }}
                            />
                            <div className={cn(
                              "absolute inset-0 flex flex-col items-center justify-center transition-opacity",
                              isPreviewing ? "bg-amber-400/30 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"
                            )}>
                              <Play className="w-5 h-5 text-white drop-shadow" fill="white" />
                            </div>
                            {/* Keyword label */}
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
                  <p className="text-xs text-gray-400 mb-2">Click ▶ to preview · click row to select</p>
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
                            : <Play  className="w-2.5 h-2.5" fill="currentColor" />
                          }
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

          {/* Col 3: Output preview ───────────────────────────────── */}
          <div className="w-72 flex flex-col bg-gray-50 shrink-0">
            <div className="shrink-0 h-10 flex items-center px-4 border-b border-gray-100 bg-white gap-2">
              <Video className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700 flex-1">
                {previewClip ? "B-Roll Preview" : "Output"}
              </span>
              {previewClip && (
                <button
                  onClick={() => setPreviewClip(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {isCompleted && !previewClip && (
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Ready</span>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-hidden">
              {/* Video frame with title overlay */}
              <div className={cn(
                "relative bg-gray-900 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center",
                project.aspectRatio === "9:16" ? "w-36 h-64" :
                project.aspectRatio === "1:1"  ? "w-48 h-48" : "w-full h-28"
              )}>
                {outputVideoUrl ? (
                  <>
                    <video
                      key={outputVideoUrl}
                      src={outputVideoUrl}
                      controls
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                    {/* Title overlay at bottom */}
                    {!previewClip && project.title && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 pointer-events-none">
                        <p className="text-white text-[10px] font-bold text-center leading-tight line-clamp-2">
                          {project.title}
                        </p>
                      </div>
                    )}
                  </>
                ) : isRendering || (isAutoRunning && autoStep === 3) ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    <span className="text-xs text-gray-400">Rendering…</span>
                  </div>
                ) : project.thumbnailUrl ? (
                  <img
                    src={proxyUrl(project.thumbnailUrl)}
                    className="w-full h-full object-cover opacity-50"
                    alt=""
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="text-center p-3">
                    <Play className="w-6 h-6 text-gray-600 mx-auto" />
                    <p className="text-[10px] text-gray-500 mt-1">No video yet</p>
                  </div>
                )}
              </div>

              {/* Meta */}
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
              </div>

              {/* Download — routed through backend proxy */}
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
