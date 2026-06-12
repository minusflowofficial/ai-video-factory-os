import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Scissors, Youtube, Loader2, ChevronDown, ChevronUp,
  Download, Zap, Copy, Check, AlertCircle, Clock,
  TrendingUp, MessageSquare, Share2, Eye, Settings2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface TranscriptSegment { start: string; end: string; text: string; }
interface VideoInfo { name: string; author: string; duration: string; thumbnailUrl?: { hqdefault?: string }; }
interface TranscriptData {
  videoId: string;
  videoInfo: VideoInfo;
  language_code: { code: string; name: string }[];
  transcripts: Record<string, { custom: TranscriptSegment[] }>;
}

interface ViralClip {
  id: number;
  startTime: string;
  endTime: string;
  duration: string;
  topic: string;
  hookType: string;
  viralScore: number;
  platform: string;
  hook: string;
  punchline: string;
  whyItWorks: string;
  ctaOptions: string[];
  titleIdeas: string[];
  hashtags: string[];
  editorNotes: string;
  captionStyle?: string;
  hookStrength?: number;
  retentionScore?: number;
  shareability?: number;
  commentPotential?: number;
}

// ── Options config ─────────────────────────────────────────────────────────
const NUM_CLIPS_OPTIONS   = [5, 10, 15, 20];
const ASPECT_RATIOS       = [{ val: "9:16", label: "9:16", sub: "Portrait" }, { val: "1:1", label: "1:1", sub: "Square" }, { val: "16:9", label: "16:9", sub: "Landscape" }];
const MIN_DURATIONS       = [{ val: "20", label: "20s" }, { val: "30", label: "30s" }, { val: "45", label: "45s" }, { val: "60", label: "60s" }, { val: "90", label: "90s" }];
const CAPTION_STYLES      = [
  { val: "Bold Yellow",   label: "Bold Yellow",   color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { val: "White Outline", label: "White Outline",  color: "bg-gray-100 text-gray-800 border-gray-300" },
  { val: "Minimal",       label: "Minimal",        color: "bg-slate-100 text-slate-600 border-slate-200" },
  { val: "Cinematic",     label: "Cinematic",      color: "bg-zinc-800 text-zinc-100 border-zinc-600" },
  { val: "Neon",          label: "Neon",           color: "bg-purple-100 text-purple-800 border-purple-300" },
  { val: "Fire",          label: "Fire",           color: "bg-orange-100 text-orange-800 border-orange-300" },
];
const HOOK_TYPES = ["Any", "Curiosity", "Shock", "Debate", "Story", "Emotional", "Educational", "Contrarian", "Inspirational", "Controversial", "Fear", "Warning"];

const HOOK_COLORS: Record<string, string> = {
  Curiosity:      "bg-blue-100 text-blue-700",
  Shock:          "bg-red-100 text-red-700",
  Debate:         "bg-orange-100 text-orange-700",
  Story:          "bg-purple-100 text-purple-700",
  Emotional:      "bg-pink-100 text-pink-700",
  Educational:    "bg-green-100 text-green-700",
  Contrarian:     "bg-yellow-100 text-yellow-700",
  Inspirational:  "bg-emerald-100 text-emerald-700",
  Controversial:  "bg-rose-100 text-rose-700",
  Fear:           "bg-gray-100 text-gray-700",
  Warning:        "bg-amber-100 text-amber-700",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function ScorePill({ label, value }: { label: string; value?: number }) {
  if (!value) return null;
  const color = value >= 8 ? "text-emerald-600" : value >= 6 ? "text-amber-600" : "text-gray-400";
  return (
    <div className="flex flex-col items-center">
      <span className={cn("font-bold text-base", color)}>{value}/10</span>
      <span className="text-[10px] text-gray-400 leading-tight text-center">{label}</span>
    </div>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
        active ? "bg-violet-500 border-violet-500 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-violet-300 hover:text-violet-600"
      )}
    >
      {children}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ClipperPage() {
  const [url, setUrl]         = useState("");
  const [language, setLang]   = useState("en");
  const [fetching, setFetch]  = useState(false);
  const [analyzing, setAna]   = useState(false);
  const [transcript, setTx]   = useState<TranscriptData | null>(null);
  const [clips, setClips]     = useState<ViralClip[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExp]    = useState<number | null>(null);
  const [copiedId, setCopied] = useState<string | null>(null);

  // Options
  const [numClips,     setNumClips]     = useState(10);
  const [aspectRatio,  setAspectRatio]  = useState("9:16");
  const [minDuration,  setMinDuration]  = useState("30");
  const [captionStyle, setCaptionStyle] = useState("Bold Yellow");
  const [hookFilter,   setHookFilter]   = useState("Any");

  // Clip download state
  const [clipDialog,   setClipDialog]   = useState<ViralClip | null>(null);
  const [clipVideoUrl, setClipVidUrl]   = useState("");
  const [clipAR,       setClipAR]       = useState("9:16");
  const [clipping,     setClipping]     = useState(false);
  const [clipToken,    setClipToken]    = useState<string | null>(null);

  const txRef = useRef<HTMLDivElement>(null);

  // ── Fetch Transcript ─────────────────────────────────────────────────────
  const fetchTranscript = async () => {
    if (!url.trim()) return;
    setError(null);
    setFetch(true);
    setTx(null);
    setClips([]);
    try {
      const res = await fetch("/api/clipper/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to fetch transcript"); return; }
      setTx(data);
      if (data.language_code?.length) setLang(data.language_code[0].code);
    } catch (e: any) {
      setError(e?.name === "TimeoutError" ? "Request timed out. Check your connection." : "Network error. Please try again.");
    } finally {
      setFetch(false);
    }
  };

  // ── Analyze Transcript ───────────────────────────────────────────────────
  const analyzeTranscript = async () => {
    if (!transcript) return;
    setError(null);
    setAna(true);
    setClips([]);
    setExp(null);
    try {
      const res = await fetch("/api/clipper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcripts:  transcript.transcripts,
          videoInfo:    transcript.videoInfo,
          language,
          numClips,
          minDuration:  parseInt(minDuration),
          captionStyle,
          hookFilter:   hookFilter === "Any" ? null : hookFilter,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "AI analysis failed"); return; }
      const found: ViralClip[] = data.clips ?? [];
      setClips(found);
      if (!found.length) setError("No viral clips found. Try a longer video or different settings.");
      else {
        // Sync clip dialog AR with current aspect ratio
        setClipAR(aspectRatio);
      }
    } catch (e: any) {
      setError(e?.name === "TimeoutError"
        ? "AI analysis timed out (>2 min). Try a shorter video."
        : "AI analysis failed. Please try again.");
    } finally {
      setAna(false);
    }
  };

  // ── Extract Clip ─────────────────────────────────────────────────────────
  const extractClip = async () => {
    if (!clipDialog || !clipVideoUrl.trim()) return;
    setClipping(true);
    setClipToken(null);
    try {
      const res = await fetch("/api/clipper/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl:    clipVideoUrl.trim(),
          startTime:   clipDialog.startTime,
          endTime:     clipDialog.endTime,
          aspectRatio: clipAR,
          clipId:      clipDialog.id,
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Clip extraction failed"); return; }
      setClipToken(data.downloadToken);
    } catch {
      setError("Clip extraction failed. Please try again.");
    } finally {
      setClipping(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const segments  = transcript
    ? (transcript.transcripts[language]?.custom ?? transcript.transcripts["en"]?.custom ?? [])
    : [];
  const fullText  = segments.map(s => s.text).join(" ");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  const displayedClips = clips
    .filter(c => hookFilter === "Any" || c.hookType === hookFilter)
    .sort((a, b) => b.viralScore - a.viralScore);

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Clipper</h1>
              <p className="text-xs text-gray-500">YouTube Transcript → AI Viral Clip Analysis → Face-Centered Clipping</p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-6 space-y-5">
          {/* Step 1: URL */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Youtube className="w-4 h-4 text-red-500" />
              <span className="font-medium text-sm text-gray-900">Step 1 — Paste YouTube URL</span>
            </div>
            <div className="flex gap-3">
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchTranscript()}
                placeholder="https://youtube.com/watch?v=... or video ID"
                className="flex-1 h-9 text-sm"
              />
              <Button
                onClick={fetchTranscript}
                disabled={fetching || !url.trim()}
                className="bg-violet-500 hover:bg-violet-600 text-white h-9 px-5 text-sm shrink-0"
              >
                {fetching ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Fetching…</> : "Fetch Transcript"}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Video Info + Transcript */}
          {transcript && (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex gap-4">
                  {transcript.videoInfo.thumbnailUrl?.hqdefault && (
                    <img
                      src={`/api/proxy?url=${encodeURIComponent(transcript.videoInfo.thumbnailUrl.hqdefault)}`}
                      alt="thumbnail"
                      className="w-32 h-20 object-cover rounded-lg shrink-0 bg-gray-100"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{transcript.videoInfo.name}</h2>
                    <p className="text-xs text-gray-500 mt-1">{transcript.videoInfo.author}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDuration(parseInt(transcript.videoInfo.duration ?? "0"))}
                      </div>
                      <span className="text-xs text-gray-500">{wordCount.toLocaleString()} words</span>
                      {transcript.language_code?.length > 1 && (
                        <select value={language} onChange={e => setLang(e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white">
                          {transcript.language_code.map(l => (
                            <option key={l.code} value={l.code}>{l.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcript Viewer */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Transcript ({segments.length} segments)</span>
                  <Button size="sm" variant="ghost" onClick={() => copyText(fullText, "full")} className="h-7 text-xs gap-1">
                    {copiedId === "full" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Copy all
                  </Button>
                </div>
                <div ref={txRef} className="max-h-52 overflow-y-auto p-5 space-y-1">
                  {segments.map((seg, i) => (
                    <div key={i} className="flex gap-3 text-sm hover:bg-gray-50 rounded px-1 py-0.5">
                      <span className="text-xs text-violet-500 font-mono shrink-0 w-16 mt-0.5">{seg.start}</span>
                      <span className="text-gray-700 leading-relaxed">{seg.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2: Options + Analyze */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-sm text-gray-900">Step 2 — Configure &amp; Analyze</span>
                  <span className="text-xs text-gray-400 ml-auto">Powered by Qwen Flash</span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Row 1: Number of clips + Min duration */}
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Number of Clips</p>
                      <div className="flex gap-2">
                        {NUM_CLIPS_OPTIONS.map(n => (
                          <ToggleChip key={n} active={numClips === n} onClick={() => setNumClips(n)}>{n}</ToggleChip>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Min Clip Duration</p>
                      <div className="flex gap-2">
                        {MIN_DURATIONS.map(d => (
                          <ToggleChip key={d.val} active={minDuration === d.val} onClick={() => setMinDuration(d.val)}>{d.label}</ToggleChip>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Aspect ratio */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Clip Aspect Ratio</p>
                    <div className="flex gap-2">
                      {ASPECT_RATIOS.map(ar => (
                        <button
                          key={ar.val}
                          onClick={() => { setAspectRatio(ar.val); setClipAR(ar.val); }}
                          className={cn(
                            "flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border text-xs font-medium transition-all",
                            aspectRatio === ar.val
                              ? "bg-violet-500 border-violet-500 text-white"
                              : "border-gray-200 text-gray-600 bg-white hover:border-violet-300"
                          )}
                        >
                          <span className="font-bold">{ar.label}</span>
                          <span className={cn("text-[10px]", aspectRatio === ar.val ? "text-violet-200" : "text-gray-400")}>{ar.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 3: Caption style */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Caption Style</p>
                    <div className="flex flex-wrap gap-2">
                      {CAPTION_STYLES.map(s => (
                        <button
                          key={s.val}
                          onClick={() => setCaptionStyle(s.val)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            captionStyle === s.val
                              ? "ring-2 ring-violet-400 ring-offset-1 " + s.color
                              : s.color + " opacity-70 hover:opacity-100"
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 4: Hook type filter */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hook Type Focus</p>
                    <div className="flex flex-wrap gap-2">
                      {HOOK_TYPES.map(h => (
                        <ToggleChip key={h} active={hookFilter === h} onClick={() => setHookFilter(h)}>{h}</ToggleChip>
                      ))}
                    </div>
                  </div>

                  {/* Analyze button */}
                  <div className="pt-1 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {numClips} clips · {minDuration}s+ · {aspectRatio} · {captionStyle}
                      {hookFilter !== "Any" ? ` · ${hookFilter} hooks` : ""}
                    </p>
                    <Button
                      onClick={analyzeTranscript}
                      disabled={analyzing}
                      className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-sm h-9 px-6"
                    >
                      {analyzing
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing…</>
                        : <><Zap className="w-3.5 h-3.5 mr-1.5" />Find Viral Clips</>}
                    </Button>
                  </div>
                  {analyzing && (
                    <p className="text-xs text-gray-400 -mt-3">
                      AI is scanning {segments.length} segments for viral opportunities… (may take 15–30 seconds)
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Viral Clips Results */}
          {clips.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-500" />
                  <h2 className="font-semibold text-sm text-gray-900">
                    {displayedClips.length} Viral Clips Found
                  </h2>
                  <span className="text-xs text-gray-400">
                    {aspectRatio} · {captionStyle}
                  </span>
                </div>
                {hookFilter !== "Any" && (
                  <button onClick={() => setHookFilter("Any")} className="text-xs text-violet-500 hover:underline">
                    Show all hooks
                  </button>
                )}
              </div>

              {/* Summary Table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-8">#</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Time</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Topic</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Hook Type</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Score</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Caption</th>
                      <th className="px-4 py-2.5 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedClips.map(clip => (
                      <tr
                        key={clip.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExp(expanded === clip.id ? null : clip.id)}
                      >
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono">{clip.id}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-violet-600">{clip.startTime}</span>
                          <span className="text-gray-300 mx-1">→</span>
                          <span className="font-mono text-xs text-violet-600">{clip.endTime}</span>
                          <span className="text-xs text-gray-400 ml-1">({clip.duration})</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-[180px] truncate">{clip.topic}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            HOOK_COLORS[clip.hookType] ?? "bg-gray-100 text-gray-600"
                          )}>
                            {clip.hookType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "font-bold text-sm",
                            clip.viralScore >= 9 ? "text-emerald-600" :
                            clip.viralScore >= 7 ? "text-amber-600" : "text-gray-400"
                          )}>
                            {clip.viralScore}/10
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const cs = CAPTION_STYLES.find(s => s.val === (clip.captionStyle ?? captionStyle));
                            return cs ? (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold", cs.color)}>
                                {cs.label}
                              </span>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm" variant="ghost"
                              onClick={e => { e.stopPropagation(); setClipDialog(clip); setClipToken(null); }}
                              className="h-6 text-xs px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                            >
                              <Scissors className="w-3 h-3 mr-1" />Clip
                            </Button>
                            {expanded === clip.id
                              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Expanded Clip Detail */}
              {expanded !== null && (() => {
                const clip = clips.find(c => c.id === expanded);
                if (!clip) return null;
                return (
                  <div className="bg-white rounded-xl border border-violet-100 shadow-sm p-6 space-y-5">
                    {/* Score row */}
                    <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-lg">
                      <ScorePill label="Hook"      value={clip.hookStrength} />
                      <ScorePill label="Retention" value={clip.retentionScore} />
                      <ScorePill label="Shareable" value={clip.shareability} />
                      <ScorePill label="Comments"  value={clip.commentPotential} />
                      <div className="ml-auto text-right">
                        <div className={cn("text-2xl font-black", clip.viralScore >= 9 ? "text-emerald-500" : "text-amber-500")}>
                          {clip.viralScore}/10
                        </div>
                        <div className="text-xs text-gray-400">Viral Score</div>
                      </div>
                    </div>

                    {/* Caption style badge */}
                    <div className="flex items-center gap-2">
                      {(() => {
                        const cs = CAPTION_STYLES.find(s => s.val === (clip.captionStyle ?? captionStyle));
                        return cs ? (
                          <span className={cn("text-xs px-3 py-1 rounded-lg border font-semibold", cs.color)}>
                            Caption: {cs.label}
                          </span>
                        ) : null;
                      })()}
                      <span className="text-xs text-gray-400 px-3 py-1 rounded-lg border border-gray-200 bg-gray-50">
                        {aspectRatio} · {clip.platform}
                      </span>
                    </div>

                    {/* Hook */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Opening Hook</p>
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-base font-bold text-gray-900 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
                          "{clip.hook}"
                        </p>
                        <button
                          onClick={() => copyText(clip.hook, `hook-${clip.id}`)}
                          className="mt-2 p-1.5 rounded hover:bg-gray-100"
                        >
                          {copiedId === `hook-${clip.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                      </div>
                    </div>

                    {/* Why it works + Punchline */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Why it works
                        </p>
                        <p className="text-sm text-gray-600 leading-relaxed">{clip.whyItWorks}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Punchline / Reveal</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{clip.punchline}</p>
                      </div>
                    </div>

                    {/* Title Ideas */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Title Ideas
                      </p>
                      <div className="space-y-1.5">
                        {clip.titleIdeas?.slice(0, 5).map((t, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                            <span className="text-sm text-gray-700 flex-1">{t}</span>
                            <button onClick={() => copyText(t, `title-${clip.id}-${i}`)} className="p-1 rounded hover:bg-gray-200">
                              {copiedId === `title-${clip.id}-${i}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTAs */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> CTA Options
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {clip.ctaOptions?.map((cta, i) => (
                          <button
                            key={i}
                            onClick={() => copyText(cta, `cta-${clip.id}-${i}`)}
                            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                          >
                            {copiedId === `cta-${clip.id}-${i}` ? "✓ Copied" : cta}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hashtags */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Share2 className="w-3 h-3" /> Hashtags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {clip.hashtags?.map((tag, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                            {tag}
                          </span>
                        ))}
                        <button
                          onClick={() => copyText(clip.hashtags?.join(" ") ?? "", `htag-${clip.id}`)}
                          className="text-xs px-2 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        >
                          {copiedId === `htag-${clip.id}` ? "✓ Copied" : "Copy all"}
                        </button>
                      </div>
                    </div>

                    {/* Editor Notes */}
                    {clip.editorNotes && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Editor Notes</p>
                        <p className="text-sm text-amber-900 leading-relaxed">{clip.editorNotes}</p>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t border-gray-100">
                      <Button
                        onClick={() => { setClipDialog(clip); setClipToken(null); }}
                        className="bg-violet-500 hover:bg-violet-600 text-white text-sm h-9 px-6"
                      >
                        <Scissors className="w-3.5 h-3.5 mr-1.5" />
                        Extract This Clip (Face-Centered)
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Clip Download Dialog */}
      {clipDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setClipDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Scissors className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold text-gray-900">Extract Clip #{clipDialog.id}</h3>
            </div>

            <div className="bg-violet-50 rounded-lg p-3 text-sm">
              <p className="text-violet-800 font-medium">{clipDialog.topic}</p>
              <p className="text-violet-600 text-xs mt-0.5 font-mono">{clipDialog.startTime} → {clipDialog.endTime} ({clipDialog.duration})</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Direct Video URL (MP4/WebM)</label>
              <Input value={clipVideoUrl} onChange={e => setClipVidUrl(e.target.value)}
                placeholder="https://example.com/video.mp4" className="text-sm h-9" />
              <p className="text-xs text-gray-400 mt-1">Paste a direct MP4 link. Face detection &amp; crop applied automatically.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Output Aspect Ratio</label>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map(ar => (
                  <button key={ar.val} onClick={() => setClipAR(ar.val)}
                    className={cn("flex-1 text-xs py-2 rounded-lg border font-medium transition-colors",
                      clipAR === ar.val ? "bg-violet-500 border-violet-500 text-white" : "border-gray-200 text-gray-600 hover:border-violet-300")}>
                    {ar.label} {ar.sub}
                  </button>
                ))}
              </div>
            </div>

            {clipToken && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-3">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-emerald-800 font-medium">Clip ready!</p>
                  <p className="text-xs text-emerald-600">Face-centered &amp; cropped to {clipAR}.</p>
                </div>
                <a href={`/api/clipper/download/${clipToken}`} download="clip.mp4"
                  className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-600">
                  <Download className="w-3 h-3" /> Download
                </a>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setClipDialog(null)} className="flex-1 h-9 text-sm">Cancel</Button>
              <Button onClick={extractClip} disabled={clipping || !clipVideoUrl.trim()}
                className="flex-1 h-9 text-sm bg-violet-500 hover:bg-violet-600 text-white">
                {clipping
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Processing…</>
                  : <><Scissors className="w-3.5 h-3.5 mr-1.5" />Extract Clip</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
