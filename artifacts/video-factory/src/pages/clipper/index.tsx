import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Scissors, Loader2, Download, Zap, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Sparkles, Film,
  ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ClipResult {
  id: number; title: string; hook: string; hookType: string;
  viralScore: number; startTime: string; endTime: string; duration: string;
  status: "pending" | "processing" | "done" | "error";
  downloadToken?: string; sizeMb?: number; error?: string;
}

interface JobStatus {
  id: string;
  status: "queued" | "downloading" | "transcribing" | "analyzing" | "creating" | "done" | "error";
  stepLabel: string; progress: number;
  totalClips: number; doneClips: number;
  videoTitle?: string; error?: string;
  clips: ClipResult[];
}

// ── Config options ─────────────────────────────────────────────────────────────
const NUM_CLIPS = [3, 5, 8, 10];
const ASPECT_RATIOS = [
  { val: "9:16", icon: "▯", label: "9:16", sub: "Portrait" },
  { val: "1:1",  icon: "□", label: "1:1",  sub: "Square"   },
  { val: "16:9", icon: "▭", label: "16:9", sub: "Landscape" },
];
const CAPTION_STYLES = [
  { val: "Bold Yellow",   dot: "bg-yellow-400",  ring: "ring-yellow-400"  },
  { val: "White Outline", dot: "bg-white",        ring: "ring-white"       },
  { val: "Minimal",       dot: "bg-slate-300",    ring: "ring-slate-400"   },
  { val: "Cinematic",     dot: "bg-zinc-800 border border-zinc-500", ring: "ring-zinc-400" },
  { val: "Neon",          dot: "bg-green-400",    ring: "ring-green-400"   },
  { val: "Fire",          dot: "bg-orange-500",   ring: "ring-orange-500"  },
];
const HOOK_TYPES = ["Any", "Curiosity", "Shock", "Story", "Emotional", "Educational", "Inspirational", "Controversial"];
const MIN_DURATIONS = [{ val: "20", label: "20s" }, { val: "30", label: "30s" }, { val: "45", label: "45s" }, { val: "60", label: "60s" }];

const HOOK_COLORS: Record<string, string> = {
  Curiosity: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Shock: "bg-red-500/20 text-red-300 border-red-500/30",
  Story: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Emotional: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  Educational: "bg-green-500/20 text-green-300 border-green-500/30",
  Inspirational: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Controversial: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  Contrarian: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const PIPELINE_STEPS = [
  { key: "downloading",  label: "Downloading video"  },
  { key: "transcribing", label: "Fetching transcript" },
  { key: "analyzing",   label: "AI analysis"         },
  { key: "creating",    label: "Creating clips"       },
  { key: "done",        label: "Clips ready!"         },
];

function isStepDone(jobStatus: string, stepKey: string) {
  const order = ["queued", "downloading", "transcribing", "analyzing", "creating", "done"];
  return order.indexOf(jobStatus) > order.indexOf(stepKey);
}
function isStepActive(jobStatus: string, stepKey: string) {
  return jobStatus === stepKey;
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ClipperPage() {
  const [url,          setUrl]         = useState("");
  const [numClips,     setNumClips]    = useState(5);
  const [aspectRatio,  setAspect]      = useState("9:16");
  const [captionStyle, setCaption]     = useState("Bold Yellow");
  const [hookFilter,   setHookFilter]  = useState("Any");
  const [minDuration,  setMinDur]      = useState("30");

  const [jobId,        setJobId]       = useState<string | null>(null);
  const [job,          setJob]         = useState<JobStatus | null>(null);
  const [starting,     setStarting]    = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [expanded,     setExpanded]    = useState<number | null>(null);
  const [copied,       setCopied]      = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clipper/status/${jobId}`);
        const data: JobStatus = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current!);
        }
      } catch { /* ignore network hiccups */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const startPipeline = async () => {
    if (!url.trim()) return;
    setError(null);
    setJob(null);
    setJobId(null);
    setExpanded(null);
    setStarting(true);
    try {
      const res = await fetch("/api/clipper/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(), numClips, aspectRatio, captionStyle,
          hookFilter: hookFilter === "Any" ? null : hookFilter,
          minDuration: parseInt(minDuration),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start"); return; }
      setJobId(data.jobId);
    } catch (e: any) {
      setError(e?.name === "TimeoutError" ? "Request timed out." : e.message ?? "Failed to start");
    } finally {
      setStarting(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const isRunning = job && !["done", "error"].includes(job.status);
  const isDone    = job?.status === "done";
  const isError   = job?.status === "error";

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0f0f13]">

        {/* ── Hero Header ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-purple-900/20 to-transparent pointer-events-none" />
          <div className="relative px-8 py-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Scissors className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">AI Clipper</h1>
                <p className="text-xs text-white/40">Paste a YouTube link → get viral clips with captions, ready to post</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

          {/* ── URL Input ─────────────────────────────────────────────── */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl blur opacity-30 group-focus-within:opacity-60 transition-opacity" />
            <div className="relative bg-[#18181f] rounded-2xl border border-white/10 p-5">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                YouTube URL
              </label>
              <div className="flex gap-3">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !starting && !isRunning && startPipeline()}
                  placeholder="https://youtube.com/watch?v=... or paste a video ID"
                  className="flex-1 bg-[#0f0f13] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 transition-all"
                  disabled={!!isRunning}
                />
                <Button
                  onClick={startPipeline}
                  disabled={!url.trim() || starting || !!isRunning}
                  className="shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-6 py-3 h-auto rounded-xl shadow-lg shadow-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {starting || isRunning
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Working…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Create Clips</>}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Config Grid ───────────────────────────────────────────── */}
          {!jobId && (
            <div className="grid grid-cols-2 gap-4">

              {/* Clips count */}
              <div className="bg-[#18181f] rounded-2xl border border-white/8 p-4">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Film className="w-3 h-3" /> Number of Clips
                </p>
                <div className="flex gap-2">
                  {NUM_CLIPS.map(n => (
                    <button key={n} onClick={() => setNumClips(n)}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                        numClips === n
                          ? "bg-violet-600 text-white shadow-md shadow-violet-500/30"
                          : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                      )}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min duration */}
              <div className="bg-[#18181f] rounded-2xl border border-white/8 p-4">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Min Duration
                </p>
                <div className="flex gap-2">
                  {MIN_DURATIONS.map(d => (
                    <button key={d.val} onClick={() => setMinDur(d.val)}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                        minDuration === d.val
                          ? "bg-violet-600 text-white shadow-md shadow-violet-500/30"
                          : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                      )}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect ratio */}
              <div className="bg-[#18181f] rounded-2xl border border-white/8 p-4">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">
                  Aspect Ratio
                </p>
                <div className="flex gap-3">
                  {ASPECT_RATIOS.map(ar => (
                    <button key={ar.val} onClick={() => setAspect(ar.val)}
                      className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all",
                        aspectRatio === ar.val
                          ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                          : "bg-white/3 border-white/8 text-white/40 hover:border-white/20 hover:text-white/60"
                      )}>
                      <span className="text-2xl leading-none">{ar.icon}</span>
                      <span className="text-xs font-bold">{ar.label}</span>
                      <span className="text-[9px] opacity-60">{ar.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption style */}
              <div className="bg-[#18181f] rounded-2xl border border-white/8 p-4">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">
                  Caption Style
                </p>
                <div className="flex flex-wrap gap-2">
                  {CAPTION_STYLES.map(s => (
                    <button key={s.val} onClick={() => setCaption(s.val)}
                      className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                        captionStyle === s.val
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/3 border-white/8 text-white/40 hover:border-white/20 hover:text-white/60"
                      )}>
                      <span className={cn("w-3 h-3 rounded-full flex-shrink-0", s.dot,
                        captionStyle === s.val ? `ring-2 ring-offset-1 ring-offset-[#18181f] ${s.ring}` : ""
                      )} />
                      {s.val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hook type - full width */}
              <div className="col-span-2 bg-[#18181f] rounded-2xl border border-white/8 p-4">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Hook Type Focus
                </p>
                <div className="flex flex-wrap gap-2">
                  {HOOK_TYPES.map(h => (
                    <button key={h} onClick={() => setHookFilter(h)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        hookFilter === h
                          ? "bg-violet-600/30 border-violet-500/50 text-violet-300"
                          : "bg-white/3 border-white/8 text-white/40 hover:border-white/20 hover:text-white/60"
                      )}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* ── Progress ──────────────────────────────────────────────── */}
          {job && (
            <div className="bg-[#18181f] rounded-2xl border border-white/8 p-5 space-y-5">

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white/60">{job.stepLabel}</span>
                  <span className="text-xs font-bold text-violet-400">{job.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>

              {/* Step timeline */}
              <div className="flex items-center gap-0">
                {PIPELINE_STEPS.map((step, i) => {
                  const done   = isStepDone(job.status, step.key);
                  const active = isStepActive(job.status, step.key);
                  return (
                    <div key={step.key} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                          done   ? "bg-emerald-500" :
                          active ? "bg-violet-500 shadow-md shadow-violet-500/40 animate-pulse" :
                                   "bg-white/10"
                        )}>
                          {done
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            : active
                              ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                              : <span className="w-1.5 h-1.5 rounded-full bg-white/30" />}
                        </div>
                        <span className={cn("text-[9px] font-medium text-center leading-tight max-w-[60px]",
                          done ? "text-emerald-400" : active ? "text-violet-300" : "text-white/25"
                        )}>
                          {step.label}
                        </span>
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className={cn("h-px flex-1 mx-1 mb-4", done ? "bg-emerald-500/50" : "bg-white/8")} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Video title */}
              {job.videoTitle && (
                <div className="bg-white/3 rounded-lg px-4 py-2 text-sm text-white/60 truncate">
                  🎬 {job.videoTitle}
                </div>
              )}

              {/* Creating clips sub-progress */}
              {(job.status === "creating" || job.status === "done") && job.totalClips > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-500"
                      style={{ width: `${(job.doneClips / job.totalClips) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/40 shrink-0">
                    {job.doneClips}/{job.totalClips} clips
                  </span>
                </div>
              )}

              {/* Error */}
              {isError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300">{job.error}</p>
                </div>
              )}

              {/* Reset button */}
              {(isDone || isError) && (
                <button
                  onClick={() => { setJobId(null); setJob(null); setError(null); setExpanded(null); }}
                  className="text-xs text-violet-400 hover:text-violet-300 underline"
                >
                  ← Start new
                </button>
              )}
            </div>
          )}

          {/* ── Clip Result Cards ──────────────────────────────────────── */}
          {job && job.clips.length > 0 && (
            <div className="space-y-3">
              {job.status === "done" && (
                <div className="flex items-center gap-2 px-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">
                    {job.doneClips} clip{job.doneClips !== 1 ? "s" : ""} ready to download
                  </span>
                  <span className="text-xs text-white/30">· {aspectRatio} · {captionStyle}</span>
                </div>
              )}

              {job.clips.map(clip => (
                <div
                  key={clip.id}
                  className={cn(
                    "rounded-2xl border transition-all",
                    clip.status === "done"      ? "bg-[#18181f] border-emerald-500/20" :
                    clip.status === "processing" ? "bg-[#18181f] border-violet-500/30" :
                    clip.status === "error"      ? "bg-[#18181f] border-red-500/20" :
                                                   "bg-[#18181f] border-white/6"
                  )}
                >
                  {/* Clip header */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === clip.id ? null : clip.id)}
                  >
                    {/* Status indicator */}
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      clip.status === "done"       ? "bg-emerald-500/15" :
                      clip.status === "processing" ? "bg-violet-500/15" :
                      clip.status === "error"      ? "bg-red-500/15" :
                                                     "bg-white/5"
                    )}>
                      {clip.status === "done"       ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                       clip.status === "processing" ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin" /> :
                       clip.status === "error"      ? <AlertCircle className="w-4 h-4 text-red-400" /> :
                                                      <Clock className="w-4 h-4 text-white/20" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">{clip.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-violet-400">{clip.startTime} → {clip.endTime}</span>
                        <span className="text-[10px] text-white/30">({clip.duration})</span>
                        {clip.hookType && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                            HOOK_COLORS[clip.hookType] ?? "bg-white/5 text-white/30 border-white/10"
                          )}>
                            {clip.hookType}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Viral score */}
                    <div className="text-center mr-2">
                      <div className={cn("text-lg font-black",
                        clip.viralScore >= 9 ? "text-emerald-400" :
                        clip.viralScore >= 7 ? "text-amber-400" : "text-white/40"
                      )}>
                        {clip.viralScore}/10
                      </div>
                      <div className="text-[9px] text-white/25">viral</div>
                    </div>

                    {/* Download or status */}
                    {clip.status === "done" && clip.downloadToken ? (
                      <a
                        href={`/api/clipper/download/${clip.downloadToken}`}
                        download={`clip-${clip.id}.mp4`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {clip.sizeMb ? `${clip.sizeMb}MB` : "Download"}
                      </a>
                    ) : (
                      <span className={cn("text-xs px-3 py-1.5 rounded-lg font-medium",
                        clip.status === "processing" ? "bg-violet-500/15 text-violet-400" :
                        clip.status === "error"      ? "bg-red-500/15 text-red-400" :
                                                       "bg-white/5 text-white/25"
                      )}>
                        {clip.status === "processing" ? "Processing…" :
                         clip.status === "error"      ? "Failed" : "Queued"}
                      </span>
                    )}

                    {/* Expand toggle */}
                    <div className="text-white/20">
                      {expanded === clip.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded === clip.id && (
                    <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
                      {clip.hook && (
                        <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3">
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wide mb-0.5">Opening Hook</p>
                            <p className="text-sm font-semibold text-white/90">"{clip.hook}"</p>
                          </div>
                          <button onClick={() => copyText(clip.hook, `hook-${clip.id}`)}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/60 transition-colors">
                            {copied === `hook-${clip.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      {clip.error && (
                        <div className="text-xs text-red-300 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2">
                          Error: {clip.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
