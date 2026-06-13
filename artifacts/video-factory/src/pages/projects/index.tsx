import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListProjects, useDeleteProject, useListBulkJobs } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import {
  Film, Plus, Trash2, Clock, MonitorPlay, Smartphone, Square,
  FolderOpen, Download, Quote,
  Scissors, Youtube, Upload as UploadIcon, LayoutList, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PageTab = "studio" | "bulk" | "clipper";

interface ClipperSession {
  id: number; jobId: string; sourceType: string; sourceUrl?: string | null;
  filename?: string | null; aspectRatio: string; captionStyle: string;
  numClips: number; doneClips: number; status: string; createdAt: string;
}

interface BulkOutput {
  id: number; jobId: number; filePath: string; quoteText?: string | null;
  videoIndex?: number | null; fileExists: boolean; createdAt: string;
}

function ArIcon({ ar }: { ar?: string | null }) {
  if (ar === "9:16") return <Smartphone className="w-3 h-3" />;
  if (ar === "1:1")  return <Square       className="w-3 h-3" />;
  return                      <MonitorPlay  className="w-3 h-3" />;
}

// ── Expiry helpers (clipper tokens live 4 h from job.createdAt) ─────────────────
const CLIP_TTL_MS = 4 * 60 * 60 * 1000;

function useNowTick(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function clipperExpiryBadge(createdAtStr: string, now: number) {
  const createdAt = new Date(createdAtStr).getTime();
  const msLeft    = (createdAt + CLIP_TTL_MS) - now;
  if (msLeft <= 0) return { text: "Expired", color: "text-red-400 bg-red-50 border-red-100", expired: true };
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  const label = h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  const color = h >= 2
    ? "text-emerald-600 bg-emerald-50 border-emerald-100"
    : "text-amber-600 bg-amber-50 border-amber-100";
  return { text: label, color, expired: false };
}

export default function ProjectsHistory() {
  const [tab,    setTab]    = useState<PageTab>("studio");
  const [filter, setFilter] = useState("all");
  const queryClient         = useQueryClient();
  const now                 = useNowTick();

  const { data: projects = [], isLoading } = useListProjects(filter !== "all" ? { status: filter } : undefined);
  const { data: bulkJobs = [] }             = useListBulkJobs({ query: { queryKey: ["bulk-jobs"] } });
  const deleteProject                       = useDeleteProject();

  // Clipper history
  const [clipperSessions,    setClipperSessions]    = useState<ClipperSession[]>([]);
  const [clipperLoading,     setClipperLoading]     = useState(false);

  // Bulk output expansion
  const [expandedBulkId,     setExpandedBulkId]     = useState<number | null>(null);
  const [bulkOutputs,        setBulkOutputs]        = useState<Record<number, BulkOutput[]>>({});
  const [bulkOutputsLoading, setBulkOutputsLoading] = useState<number | null>(null);

  // ── Run cleanup on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/clipper/cleanup",    { method: "POST" }).catch(() => {});
    fetch("/api/bulk-jobs/cleanup",  { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "clipper") return;
    setClipperLoading(true);
    fetch("/api/clipper/history")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setClipperSessions(d); })
      .catch(() => {})
      .finally(() => setClipperLoading(false));
  }, [tab]);

  const toggleBulkExpand = async (jobId: number) => {
    if (expandedBulkId === jobId) { setExpandedBulkId(null); return; }
    if (bulkOutputs[jobId]) { setExpandedBulkId(jobId); return; }
    setBulkOutputsLoading(jobId);
    try {
      const data: BulkOutput[] = await fetch(`/api/bulk-jobs/${jobId}/outputs`).then(r => r.json());
      setBulkOutputs(prev => ({ ...prev, [jobId]: data }));
      setExpandedBulkId(jobId);
    } catch { setExpandedBulkId(jobId); }
    finally { setBulkOutputsLoading(null); }
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm("Delete this project?")) {
      deleteProject.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
      });
    }
  };

  // Filter out expired clipper sessions — they've been cleaned from DB, so
  // also filter any that slipped through before the next cleanup run
  const activeSessions = clipperSessions.filter(
    s => new Date(s.createdAt).getTime() + CLIP_TTL_MS > now,
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">All your generated videos</p>
          </div>
          <Link href="/studio/new">
            <Button size="sm" className="h-8 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New
            </Button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-gray-100">
          {[
            { id: "studio",  label: "Studio",           icon: <LayoutList className="w-3.5 h-3.5" /> },
            { id: "bulk",    label: "Bulk Batches",     icon: <FolderOpen className="w-3.5 h-3.5" /> },
            { id: "clipper", label: "Clipper Sessions", icon: <Scissors   className="w-3.5 h-3.5" /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as PageTab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-amber-400 text-amber-700"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── STUDIO TAB ── */}
        {tab === "studio" && (
          <>
            <div className="flex items-center justify-end mb-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-36 h-8 text-xs border-gray-200 bg-white">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="rendering">Rendering</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 220 }} />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
                <Film className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700 mb-1.5">No projects yet</h3>
                <p className="text-sm text-gray-400 mb-5">Try a different filter or create your first video.</p>
                <Link href="/studio/new">
                  <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Create new project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {projects.map((project) => (
                  <Link key={project.id} href={`/studio/${project.id}`}>
                    <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-amber-200 hover:shadow-md transition-all cursor-pointer">
                      <div className="aspect-video bg-gray-900 relative overflow-hidden">
                        {project.thumbnailUrl ? (
                          <img src={project.thumbnailUrl} alt={project.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                            <Film className="w-8 h-8 text-gray-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute top-2 right-2"><StatusBadge status={project.status} /></div>
                        <button onClick={e => handleDelete(project.id, e)}
                          className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white/70 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-2 left-2">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm",
                            project.aspectRatio === "9:16" ? "bg-purple-500/80 text-white"
                              : project.aspectRatio === "1:1" ? "bg-blue-500/80 text-white"
                              : "bg-black/50 text-white/80",
                          )}>
                            <ArIcon ar={project.aspectRatio} />{project.aspectRatio || "16:9"}
                          </span>
                        </div>
                        <div className="absolute bottom-2 right-2">
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium bg-black/50 text-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                            <Clock className="w-2.5 h-2.5" />{project.duration || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 group-hover:text-amber-700 transition-colors mb-1">
                          {project.title}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(project.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── BULK BATCHES TAB — grid of batch cards ── */}
        {tab === "bulk" && (
          <>
            {(bulkJobs as any[]).length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
                <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700 mb-1.5">No bulk batches yet</h3>
                <p className="text-sm text-gray-400 mb-5">Queue your first batch in the Bulk Factory.</p>
                <Link href="/bulk">
                  <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                    Go to Bulk Factory
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(bulkJobs as any[]).map((job) => {
                  const isExpanded = expandedBulkId === job.id;
                  const outputs    = bulkOutputs[job.id] ?? [];
                  const loadingRow = bulkOutputsLoading === job.id;
                  const isQuotes   = job.goal === "quotes";
                  const progress   = job.totalVideos > 0
                    ? Math.round(((job.completedCount || 0) / job.totalVideos) * 100)
                    : 0;

                  return (
                    <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                      {/* Card header */}
                      <div className="p-4 flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          isQuotes ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200",
                        )}>
                          {isQuotes
                            ? <Quote      className="w-5 h-5 text-amber-500" />
                            : <FolderOpen className="w-5 h-5 text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm truncate">{job.niche}</span>
                            <StatusBadge status={job.status} />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {job.completedCount}/{job.totalVideos} videos ·{" "}
                            {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="px-4 pb-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", isQuotes ? "bg-amber-400" : "bg-blue-400")}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{progress}% complete</p>
                      </div>

                      {/* Expand / collapse outputs button */}
                      {isQuotes && (
                        <div className="border-t border-gray-100">
                          <button
                            onClick={() => toggleBulkExpand(job.id)}
                            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
                          >
                            {loadingRow ? (
                              <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            {isExpanded ? "Hide videos" : "View videos"}
                          </button>

                          {/* Inline video output grid */}
                          {isExpanded && (
                            <div className="border-t border-gray-100 p-3">
                              {outputs.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-3">
                                  No outputs yet — still processing or files expired.
                                </p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {outputs.map((output, i) => (
                                    <div
                                      key={output.id}
                                      className={cn(
                                        "rounded-xl border p-2.5 flex flex-col gap-1.5",
                                        output.fileExists
                                          ? "border-amber-100 bg-amber-50/50"
                                          : "border-gray-100 bg-gray-50 opacity-60",
                                      )}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-md bg-amber-200/60 text-amber-800 text-[9px] font-bold flex items-center justify-center shrink-0">
                                          {(output.videoIndex ?? i) + 1}
                                        </span>
                                        <p className="text-[10px] text-gray-600 line-clamp-2 leading-tight flex-1">
                                          {output.quoteText || `Video ${(output.videoIndex ?? i) + 1}`}
                                        </p>
                                      </div>
                                      {output.fileExists ? (
                                        <a
                                          href={`/api/bulk-outputs/${output.id}/download`}
                                          download
                                          className="flex items-center justify-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-200 px-2 py-1 rounded-lg transition-colors"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          <Download className="w-2.5 h-2.5" /> Download
                                        </a>
                                      ) : (
                                        <span className="text-[10px] text-gray-400 text-center">File expired</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Standard batches: link to Studio tab */}
                      {!isQuotes && (
                        <div className="border-t border-gray-100 px-4 py-2.5 bg-blue-50/50">
                          <p className="text-xs text-blue-600">
                            Videos are Studio projects.{" "}
                            <button className="font-semibold underline" onClick={() => setTab("studio")}>
                              View in Studio tab →
                            </button>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CLIPPER SESSIONS TAB ── */}
        {tab === "clipper" && (
          <div className="space-y-3">
            {clipperLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-xl animate-pulse h-20" />
                ))}
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
                <Scissors className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700 mb-1.5">No active clipper sessions</h3>
                <p className="text-sm text-gray-400 mb-5">
                  {clipperSessions.length > 0
                    ? "All previous sessions have expired (clips are available for 4 hours)."
                    : "Create viral clips from any YouTube video or upload."}
                </p>
                <Link href="/clipper">
                  <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                    Open Clipper
                  </Button>
                </Link>
              </div>
            ) : (
              activeSessions.map(session => {
                const badge = clipperExpiryBadge(session.createdAt, now);
                return (
                  <div key={session.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-4 hover:border-amber-200 transition-colors">
                    {/* Source icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      session.sourceType === "youtube" ? "bg-red-50 border border-red-100" : "bg-blue-50 border border-blue-100",
                    )}>
                      {session.sourceType === "youtube"
                        ? <Youtube    className="w-5 h-5 text-red-500" />
                        : <UploadIcon className="w-5 h-5 text-blue-500" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {session.filename ?? session.sourceUrl ?? "Clipper Session"}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {session.aspectRatio}
                        </span>
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {session.captionStyle}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {session.doneClips}/{session.numClips} clips
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full",
                          badge.color,
                        )}>
                          <Timer className="w-2.5 h-2.5" />{badge.text}
                        </span>
                      </div>
                    </div>

                    {/* Action */}
                    <Link href="/clipper">
                      <Button variant="outline" size="sm"
                        className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 shrink-0">
                        <Scissors className="w-3 h-3 mr-1" /> Open
                      </Button>
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
