import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Scissors, Loader2, Download, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Sparkles, Film,
  ChevronDown, ChevronUp, Copy, Check, Cookie,
  Upload, Link2, X,
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
  status: "queued" | "uploading" | "downloading" | "transcribing" | "analyzing" | "creating" | "done" | "error";
  stepLabel: string; progress: number;
  totalClips: number; doneClips: number;
  videoTitle?: string; error?: string;
  clips: ClipResult[];
}

// ── Config ─────────────────────────────────────────────────────────────────────
const NUM_CLIPS    = [3, 5, 8, 10];
const ASPECT_RATIOS = [
  { val: "9:16", icon: "▯", label: "9:16", sub: "Portrait"  },
  { val: "1:1",  icon: "□", label: "1:1",  sub: "Square"    },
  { val: "16:9", icon: "▭", label: "16:9", sub: "Landscape" },
];
const CAPTION_STYLES = [
  { val: "Bold Yellow",   dot: "bg-yellow-400" },
  { val: "White Outline", dot: "bg-gray-100 border border-gray-300" },
  { val: "Minimal",       dot: "bg-gray-300" },
  { val: "Cinematic",     dot: "bg-gray-800" },
  { val: "Neon",          dot: "bg-green-400" },
  { val: "Fire",          dot: "bg-orange-500" },
];
const HOOK_TYPES     = ["Any","Curiosity","Shock","Story","Emotional","Educational","Inspirational","Controversial"];
const DURATION_PRESETS: { min: string; max: string; label: string }[] = [
  { min: "15", max: "30",  label: "15–30s" },
  { min: "30", max: "60",  label: "30–60s" },
  { min: "30", max: "90",  label: "30–90s" },
  { min: "60", max: "120", label: "1–2min" },
];
const HOOK_COLORS: Record<string, string> = {
  Curiosity:"bg-blue-50 text-blue-700 border-blue-200", Shock:"bg-red-50 text-red-700 border-red-200",
  Story:"bg-purple-50 text-purple-700 border-purple-200", Emotional:"bg-pink-50 text-pink-700 border-pink-200",
  Educational:"bg-green-50 text-green-700 border-green-200", Inspirational:"bg-emerald-50 text-emerald-700 border-emerald-200",
  Controversial:"bg-rose-50 text-rose-700 border-rose-200", Contrarian:"bg-amber-50 text-amber-700 border-amber-200",
};
const PIPELINE_STEPS = [
  { key:"downloading",  label:"Download"  },
  { key:"transcribing", label:"Transcript"},
  { key:"analyzing",    label:"AI"        },
  { key:"creating",     label:"Clips"     },
  { key:"done",         label:"Ready!"    },
];
const ORDER = ["queued","uploading","downloading","transcribing","analyzing","creating","done"];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ClipperPage() {
  const [tab,          setTab]         = useState<"url" | "upload">("upload");
  const [url,          setUrl]         = useState("");
  const [uploadedFile, setUploadedFile] = useState<{path:string; name:string; sizeMb:number} | null>(null);
  const [uploading,    setUploading]   = useState(false);
  const [dragOver,     setDragOver]    = useState(false);

  const [numClips,     setNumClips]    = useState(5);
  const [aspectRatio,  setAspect]      = useState("9:16");
  const [captionStyle, setCaption]     = useState("Bold Yellow");
  const [hookFilter,   setHookFilter]  = useState("Any");
  const [durPreset,    setDurPreset]   = useState(1); // index into DURATION_PRESETS
  const [previewClip,  setPreviewClip] = useState<number | null>(null);

  const [jobId,        setJobId]       = useState<string | null>(null);
  const [job,          setJob]         = useState<JobStatus | null>(null);
  const [starting,     setStarting]    = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [expanded,     setExpanded]    = useState<number | null>(null);
  const [copied,       setCopied]      = useState<string | null>(null);
  const [showCookies,  setShowCookies] = useState(false);
  const [cookiesText,  setCookiesText] = useState("");
  const [savingCookies, setSavingCookies] = useState(false);
  const [cookiesSaved,  setCookiesSaved]  = useState(false);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput  = useRef<HTMLInputElement>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const data: JobStatus = await fetch(`/api/clipper/status/${jobId}`).then(r => r.json());
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current!);
          if (data.error?.toLowerCase().includes("bot") || data.error?.toLowerCase().includes("cookies")) {
            setShowCookies(true);
          }
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  // Handle file upload
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) { setError("Please upload a video file (MP4, MOV, etc.)"); return; }
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append("video", file);
      const res  = await fetch("/api/clipper/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setUploadedFile({ path: data.filePath, name: file.name, sizeMb: data.sizeMb });
    } catch (e: any) { setError(e.message ?? "Upload failed"); }
    finally { setUploading(false); }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const startPipeline = async () => {
    setError(null); setJob(null); setJobId(null); setExpanded(null); setPreviewClip(null);
    setStarting(true);
    try {
      const dp = DURATION_PRESETS[durPreset] ?? DURATION_PRESETS[1];
      const opts = { numClips, aspectRatio, captionStyle, hookFilter: hookFilter === "Any" ? null : hookFilter, minDuration: parseInt(dp.min), maxDuration: parseInt(dp.max) };
      let endpoint: string;
      let body: object;
      if (tab === "upload") {
        if (!uploadedFile) { setError("Please upload a video file first."); return; }
        endpoint = "/api/clipper/process-local";
        body = { filePath: uploadedFile.path, videoTitle: uploadedFile.name, ...opts };
      } else {
        if (!url.trim()) { setError("Please enter a YouTube URL."); return; }
        endpoint = "/api/clipper/process";
        body = { url: url.trim(), ...opts };
      }
      const res  = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start"); return; }
      setJobId(data.jobId);
    } catch (e: any) {
      setError(e?.name === "TimeoutError" ? "Request timed out." : e.message ?? "Failed to start");
    } finally { setStarting(false); }
  };

  const saveCookies = async () => {
    if (!cookiesText.trim()) return;
    setSavingCookies(true);
    try {
      const res = await fetch("/api/clipper/save-cookies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookies: cookiesText.trim() }) });
      if (res.ok) { setCookiesSaved(true); setShowCookies(false); setCookiesText(""); setTimeout(() => setCookiesSaved(false), 3000); }
    } finally { setSavingCookies(false); }
  };

  const reset = () => { setJobId(null); setJob(null); setError(null); setExpanded(null); setUploadedFile(null); setPreviewClip(null); };
  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  const isRunning = job && !["done", "error"].includes(job.status);
  const isDone    = job?.status === "done";
  const isError   = job?.status === "error";
  const canStart  = !starting && !isRunning && (tab === "url" ? !!url.trim() : !!uploadedFile);

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">AI Clipper</h1>
              <p className="text-xs text-gray-500">YouTube link or upload a video → viral clips with captions, ready to post</p>
            </div>
          </div>
          <button onClick={() => setShowCookies(v => !v)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors px-2 py-1 rounded-lg hover:bg-amber-50">
            <Cookie className="w-3.5 h-3.5" /> {cookiesSaved ? <span className="text-emerald-600">Cookies saved ✓</span> : "YouTube Cookies"}
          </button>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

          {/* Cookies Panel */}
          {showCookies && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-amber-900">YouTube cookies (one-time setup)</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Required for newer YouTube videos. Install{" "}
                    <a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" rel="noopener noreferrer" className="underline font-medium">Get cookies.txt LOCALLY</a>{" "}
                    → visit youtube.com → Export → paste below.
                  </p>
                </div>
                <button onClick={() => setShowCookies(false)}><X className="w-4 h-4 text-amber-400 hover:text-amber-600" /></button>
              </div>
              <textarea value={cookiesText} onChange={e => setCookiesText(e.target.value)}
                placeholder={"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\t..."}
                rows={4} className="w-full text-xs font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 resize-none" />
              <Button onClick={saveCookies} disabled={!cookiesText.trim() || savingCookies}
                className="h-8 px-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                {savingCookies ? "Saving…" : "Save Cookies"}
              </Button>
            </div>
          )}

          {/* Source Tabs */}
          {!jobId && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-gray-100">
                {([["upload","Upload Video",Upload],["url","YouTube URL",Link2]] as const).map(([t, label, Icon]) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors relative",
                      tab === t ? "bg-amber-50 text-amber-800 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    )}>
                    <Icon className="w-4 h-4" />{label}
                    {t === "upload" && <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full ml-1">FAST</span>}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {tab === "url" ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5 text-xs text-yellow-800">
                      <AlertCircle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                      <span><strong>Cloud server limitation:</strong> YouTube blocks downloads for newer/protected videos from cloud IPs. Works for older videos (pre-2023). For everything else, use <button className="underline font-semibold" onClick={() => setTab("upload")}>Upload Video</button>.</span>
                    </div>
                    <div className="flex gap-3">
                      <input value={url} onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && canStart && startPipeline()}
                        placeholder="https://youtube.com/watch?v=... or video ID"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                      />
                      <Button onClick={startPipeline} disabled={!canStart}
                        className="shrink-0 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold px-5 h-auto rounded-lg disabled:opacity-40">
                        {starting || isRunning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Working…</> : <><Sparkles className="w-4 h-4 mr-2" />Create Clips</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {uploadedFile ? (
                      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{uploadedFile.name}</p>
                          <p className="text-xs text-gray-500">{uploadedFile.sizeMb} MB — ready to process</p>
                        </div>
                        <button onClick={() => setUploadedFile(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div
                        onDrop={onDrop}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onClick={() => fileInput.current?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                          dragOver ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
                        )}>
                        <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                        {uploading ? (
                          <><Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-500">Uploading…</p></>
                        ) : (
                          <><Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm font-semibold text-gray-700">Drop video here or click to browse</p><p className="text-xs text-gray-400 mt-1">MP4, MOV, AVI — up to 4 GB</p></>
                        )}
                      </div>
                    )}
                    {uploadedFile && (
                      <div className="mt-3 flex justify-end">
                        <Button onClick={startPipeline} disabled={!canStart}
                          className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold px-6 h-9 rounded-lg disabled:opacity-40">
                          {starting || isRunning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Working…</> : <><Sparkles className="w-4 h-4 mr-2" />Create Clips</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Config Grid */}
          {!jobId && (
            <div className="grid grid-cols-2 gap-4">
              {/* Clips count */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Film className="w-3 h-3" /> Number of Clips</p>
                <div className="flex gap-2">
                  {NUM_CLIPS.map(n => (
                    <button key={n} onClick={() => setNumClips(n)}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all border",
                        numClips === n ? "bg-amber-400 text-amber-950 border-amber-400" : "bg-gray-50 text-gray-500 border-gray-100 hover:border-amber-200 hover:text-amber-700"
                      )}>{n}</button>
                  ))}
                </div>
              </div>
              {/* Duration range */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Clip Duration</p>
                <div className="flex gap-2">
                  {DURATION_PRESETS.map((d, i) => (
                    <button key={d.label} onClick={() => setDurPreset(i)}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all border",
                        durPreset === i ? "bg-amber-400 text-amber-950 border-amber-400" : "bg-gray-50 text-gray-500 border-gray-100 hover:border-amber-200 hover:text-amber-700"
                      )}>{d.label}</button>
                  ))}
                </div>
              </div>
              {/* Aspect ratio */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Aspect Ratio</p>
                <div className="flex gap-3">
                  {ASPECT_RATIOS.map(ar => (
                    <button key={ar.val} onClick={() => setAspect(ar.val)}
                      className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border transition-all",
                        aspectRatio === ar.val ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-gray-50 border-gray-100 text-gray-400 hover:border-amber-200 hover:text-amber-700"
                      )}>
                      <span className="text-2xl leading-none">{ar.icon}</span>
                      <span className="text-xs font-bold">{ar.label}</span>
                      <span className="text-[9px] opacity-70">{ar.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Caption style */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Caption Style</p>
                <div className="flex flex-wrap gap-2">
                  {CAPTION_STYLES.map(s => (
                    <button key={s.val} onClick={() => setCaption(s.val)}
                      className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                        captionStyle === s.val ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-amber-200 hover:text-amber-700"
                      )}>
                      <span className={cn("w-3 h-3 rounded-full flex-shrink-0", s.dot)} />{s.val}
                    </button>
                  ))}
                </div>
              </div>
              {/* Hook type */}
              <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Hook Type Focus</p>
                <div className="flex flex-wrap gap-2">
                  {HOOK_TYPES.map(h => (
                    <button key={h} onClick={() => setHookFilter(h)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        hookFilter === h ? "bg-amber-400 text-amber-950 border-amber-400" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-amber-200 hover:text-amber-700"
                      )}>{h}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Progress */}
          {job && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">{job.stepLabel}</span>
                  <span className="text-xs font-bold text-amber-600">{job.progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${job.progress}%` }} />
                </div>
              </div>

              {/* Steps */}
              <div className="flex items-center">
                {PIPELINE_STEPS.map((step, i) => {
                  const done   = ORDER.indexOf(job.status) > ORDER.indexOf(step.key);
                  const active = job.status === step.key;
                  return (
                    <div key={step.key} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-all",
                          done ? "bg-emerald-500" : active ? "bg-amber-400 animate-pulse shadow-md shadow-amber-200" : "bg-gray-100"
                        )}>
                          {done ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : active ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
                        </div>
                        <span className={cn("text-[9px] font-medium text-center leading-tight max-w-[64px]",
                          done ? "text-emerald-600" : active ? "text-amber-700" : "text-gray-400"
                        )}>{step.label}</span>
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && <div className={cn("h-px flex-1 mx-1 mb-4", done ? "bg-emerald-300" : "bg-gray-100")} />}
                    </div>
                  );
                })}
              </div>

              {job.videoTitle && <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-600 truncate border border-gray-100">🎬 {job.videoTitle}</div>}

              {(job.status === "creating" || isDone) && job.totalClips > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{job.doneClips}/{job.totalClips} clips</span> — processing in parallel
                  </div>
                  <div className="flex gap-1.5">
                    {job.clips.map(c => (
                      <div key={c.id} className={cn("h-2 flex-1 rounded-full transition-all",
                        c.status === "done"       ? "bg-emerald-400" :
                        c.status === "processing" ? "bg-amber-300 animate-pulse" :
                        c.status === "error"      ? "bg-red-300"     : "bg-gray-100"
                      )} title={`Clip ${c.id}: ${c.status}`} />
                    ))}
                  </div>
                </div>
              )}

              {isError && (() => {
                const err = job.error ?? "";
                const isCloudBlocked = err.startsWith("CLOUD_BLOCKED:");
                const isCookiesExpired = err.startsWith("COOKIES_EXPIRED:");
                const cleanMsg = err.replace(/^(CLOUD_BLOCKED|COOKIES_EXPIRED):\s*/, "");
                return (
                  <div className={cn("rounded-lg px-3 py-3 border",
                    isCloudBlocked ? "bg-orange-50 border-orange-200" :
                    isCookiesExpired ? "bg-yellow-50 border-yellow-200" :
                    "bg-red-50 border-red-100"
                  )}>
                    <div className="flex items-start gap-2">
                      <AlertCircle className={cn("w-3.5 h-3.5 mt-0.5 shrink-0",
                        isCloudBlocked ? "text-orange-500" : isCookiesExpired ? "text-yellow-500" : "text-red-500"
                      )} />
                      <div className="space-y-2">
                        {isCloudBlocked && <p className="text-xs font-bold text-orange-800">YouTube blocked this download from the cloud server</p>}
                        {isCookiesExpired && <p className="text-xs font-bold text-yellow-800">Your YouTube cookies have expired</p>}
                        <p className={cn("text-xs", isCloudBlocked ? "text-orange-700" : isCookiesExpired ? "text-yellow-700" : "text-red-700")}>{cleanMsg}</p>
                        {(isCloudBlocked || isCookiesExpired) && (
                          <button onClick={() => { reset(); setTab("upload"); }}
                            className="mt-1 flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                            <Upload className="w-3 h-3" /> Switch to Upload tab →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(isDone || isError) && (
                <button onClick={reset} className="text-xs text-amber-600 hover:text-amber-800 underline">← Start new</button>
              )}
            </div>
          )}

          {/* Clips Grid */}
          {job && job.clips.length > 0 && (
            <div className="space-y-3">
              {isDone && (
                <div className="flex items-center gap-2 px-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-gray-800">{job.doneClips} clip{job.doneClips !== 1 ? "s" : ""} ready</span>
                  <span className="text-xs text-gray-400">· {aspectRatio} · {captionStyle}</span>
                </div>
              )}
              {job.clips.map(clip => (
                <div key={clip.id} className={cn("bg-white rounded-xl border shadow-sm transition-all",
                  clip.status === "done" ? "border-emerald-200" : clip.status === "processing" ? "border-amber-200" : clip.status === "error" ? "border-red-200" : "border-gray-100"
                )}>
                  <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(expanded === clip.id ? null : clip.id)}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      clip.status === "done" ? "bg-emerald-50" : clip.status === "processing" ? "bg-amber-50" : clip.status === "error" ? "bg-red-50" : "bg-gray-50"
                    )}>
                      {clip.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                       clip.status === "processing" ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" /> :
                       clip.status === "error" ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                       <Clock className="w-4 h-4 text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{clip.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs font-mono text-amber-600">{clip.startTime} → {clip.endTime}</span>
                        <span className="text-[10px] text-gray-400">({clip.duration})</span>
                        {clip.hookType && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", HOOK_COLORS[clip.hookType] ?? "bg-gray-50 text-gray-500 border-gray-100")}>{clip.hookType}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-center mr-1">
                      <div className={cn("text-lg font-black", clip.viralScore >= 9 ? "text-emerald-500" : clip.viralScore >= 7 ? "text-amber-500" : "text-gray-400")}>{clip.viralScore}/10</div>
                      <div className="text-[9px] text-gray-400">viral</div>
                    </div>
                    {clip.status === "done" && clip.downloadToken ? (
                      <a href={`/api/clipper/download/${clip.downloadToken}`} download="clip.mp4" onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                        <Download className="w-3.5 h-3.5" />{clip.sizeMb ? `${clip.sizeMb}MB` : "Download"}
                      </a>
                    ) : (
                      <span className={cn("text-xs px-3 py-1.5 rounded-lg font-medium border",
                        clip.status === "processing" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        clip.status === "error"      ? "bg-red-50 text-red-600 border-red-100" :
                                                       "bg-gray-50 text-gray-400 border-gray-100"
                      )}>{clip.status === "processing" ? "Processing…" : clip.status === "error" ? "Failed" : "Queued"}</span>
                    )}
                    <div className="text-gray-300">{expanded === clip.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
                  </div>
                  {expanded === clip.id && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                      {/* Inline video preview */}
                      {clip.status === "done" && clip.downloadToken && (
                        <div className="rounded-xl overflow-hidden bg-black">
                          <video
                            key={clip.downloadToken}
                            src={`/api/clipper/preview/${clip.downloadToken}`}
                            controls
                            preload="metadata"
                            className={cn("w-full max-h-[420px]", aspectRatio === "9:16" ? "max-w-[240px] mx-auto" : aspectRatio === "1:1" ? "max-w-[360px] mx-auto" : "w-full")}
                          />
                        </div>
                      )}
                      {clip.hook && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                          <div className="flex-1"><p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Opening Hook</p><p className="text-sm font-semibold text-gray-800">"{clip.hook}"</p></div>
                          <button onClick={() => copyText(clip.hook, `hook-${clip.id}`)} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-400 hover:text-amber-600">
                            {copied === `hook-${clip.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                      {clip.error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{clip.error}</div>}
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
