import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { useState, useRef } from "react";
import { useListBulkJobs, useCreateBulkJob, useCancelBulkJob } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBulkJobsQueryKey } from "@workspace/api-client-react";
import { Zap, XCircle, Film, Quote, LayoutList, Upload, Sparkles, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type JobMode       = "standard" | "quotes";
type QuotesSource  = "ai" | "manual";

function parseQuotes(text: string): string[] {
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 5);
}

export default function BulkFactory() {
  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading } = useListBulkJobs({ query: { queryKey: ["bulk-jobs"], refetchInterval: 5000 } });
  const createJob  = useCreateBulkJob();
  const cancelJob  = useCancelBulkJob();
  const fileRef    = useRef<HTMLInputElement>(null);

  const [mode,         setMode]         = useState<JobMode>("standard");
  const [quotesSource, setQuotesSource] = useState<QuotesSource>("ai");
  const [manualText,   setManualText]   = useState("");
  const [form, setForm] = useState({ niche: "", totalVideos: "10", aspectRatio: "9:16", language: "English" });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const parsedQuotes = parseQuotes(manualText);
  const isManualMode = mode === "quotes" && quotesSource === "manual";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setManualText(ev.target?.result as string ?? "");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!form.niche) return;

    const quotesPayload = isManualMode && parsedQuotes.length > 0 ? parsedQuotes : undefined;
    const videoCount    = quotesPayload ? quotesPayload.length : parseInt(form.totalVideos, 10);

    createJob.mutate(
      {
        data: {
          niche:       form.niche,
          goal:        mode === "quotes" ? "quotes" : undefined,
          totalVideos: videoCount,
          aspectRatio: form.aspectRatio,
          duration:    "60s",
          language:    mode === "quotes" ? form.language : undefined,
          quotes:      quotesPayload,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() });
          set("niche", "");
          setManualText("");
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Bulk Factory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate dozens of videos asynchronously</p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode("standard")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
              mode === "standard"
                ? "bg-amber-400 border-amber-400 text-amber-950"
                : "bg-white border-gray-200 text-gray-600 hover:border-amber-200",
            )}
          >
            <LayoutList className="w-4 h-4" />
            Standard Videos
          </button>
          <button
            onClick={() => setMode("quotes")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
              mode === "quotes"
                ? "bg-amber-400 border-amber-400 text-amber-950"
                : "bg-white border-gray-200 text-gray-600 hover:border-amber-200",
            )}
          >
            <Quote className="w-4 h-4" />
            Bulk Quotes
          </button>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          {mode === "quotes" && (
            <div className="mb-4 flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Quote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Bulk Quotes Mode</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  AI generates unique inspiring quotes, each rendered on a cinematic background with bold golden text + music.
                </p>
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            {mode === "quotes" ? "New Quote Batch" : "New Batch"}
          </h2>

          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-52">
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                {mode === "quotes" ? "Quote Theme / Topic" : "Niche / Topic"}
              </label>
              <Input
                value={form.niche}
                onChange={e => set("niche", e.target.value)}
                placeholder={mode === "quotes" ? "E.g., Motivational, Success, Life, Love…" : "E.g., Stoic Philosophy, Travel…"}
                className="h-9 text-sm border-gray-200 bg-gray-50"
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </div>

            {/* Quantity only shown in standard mode or AI quotes mode */}
            {(!isManualMode) && (
              <div className="w-36">
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Quantity</label>
                <Select value={form.totalVideos} onValueChange={v => set("totalVideos", v)}>
                  <SelectTrigger className="h-9 text-sm border-gray-200 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 Videos</SelectItem>
                    <SelectItem value="10">10 Videos</SelectItem>
                    <SelectItem value="25">25 Videos</SelectItem>
                    <SelectItem value="50">50 Videos</SelectItem>
                    <SelectItem value="100">100 Videos</SelectItem>
                    <SelectItem value="250">250 Videos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Manual mode: show parsed count instead */}
            {isManualMode && parsedQuotes.length > 0 && (
              <div className="w-36 flex flex-col justify-end pb-0.5">
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  {parsedQuotes.length} quotes
                </span>
              </div>
            )}

            <div className="w-36">
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Format</label>
              <Select value={form.aspectRatio} onValueChange={v => set("aspectRatio", v)}>
                <SelectTrigger className="h-9 text-sm border-gray-200 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 Shorts</SelectItem>
                  <SelectItem value="16:9">16:9 YouTube</SelectItem>
                  <SelectItem value="1:1">1:1 Square</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "quotes" && (
              <div className="w-36">
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Language</label>
                <Select value={form.language} onValueChange={v => set("language", v)}>
                  <SelectTrigger className="h-9 text-sm border-gray-200 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="Spanish">Spanish</SelectItem>
                    <SelectItem value="Arabic">Arabic</SelectItem>
                    <SelectItem value="Hindi">Hindi</SelectItem>
                    <SelectItem value="Urdu">Urdu</SelectItem>
                    <SelectItem value="French">French</SelectItem>
                    <SelectItem value="German">German</SelectItem>
                    <SelectItem value="Portuguese">Portuguese</SelectItem>
                    <SelectItem value="Chinese">Chinese</SelectItem>
                    <SelectItem value="Japanese">Japanese</SelectItem>
                    <SelectItem value="Turkish">Turkish</SelectItem>
                    <SelectItem value="Indonesian">Indonesian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!form.niche || createJob.isPending || (isManualMode && parsedQuotes.length === 0)}
              className="h-9 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-sm"
            >
              {mode === "quotes"
                ? <><Quote className="w-4 h-4 mr-1.5" /> Generate Quotes</>
                : <><Zap className="w-4 h-4 mr-1.5" /> Queue Job</>
              }
            </Button>
          </div>

          {/* Manual quotes input — only in quotes mode */}
          {mode === "quotes" && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {/* AI / Manual toggle */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setQuotesSource("ai")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    quotesSource === "ai"
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : "bg-gray-50 border-gray-100 text-gray-500 hover:border-amber-200",
                  )}
                >
                  <Sparkles className="w-3 h-3" /> AI Generated
                </button>
                <button
                  onClick={() => setQuotesSource("manual")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    quotesSource === "manual"
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : "bg-gray-50 border-gray-100 text-gray-500 hover:border-amber-200",
                  )}
                >
                  <FileText className="w-3 h-3" /> Manual / File
                </button>
              </div>

              {quotesSource === "manual" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">One quote per line. Blank lines are ignored.</p>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Upload className="w-3 h-3" /> Upload .txt
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                  <textarea
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    placeholder={"Every great journey begins with a single step.\nBelieve in yourself and the rest will follow.\n…"}
                    rows={6}
                    className="w-full text-sm border border-gray-200 bg-gray-50 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 placeholder:text-gray-300 font-mono"
                  />
                  {parsedQuotes.length > 0 && (
                    <p className="text-xs text-emerald-600 font-semibold">
                      ✓ {parsedQuotes.length} quote{parsedQuotes.length !== 1 ? "s" : ""} ready to render
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Queue */}
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Job Queue</h2>

        {isLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-xl border border-gray-100 border-dashed">
            <Film className="w-9 h-9 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No active or past bulk jobs.</p>
            <p className="text-xs text-gray-400 mt-1">Queue your first batch above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(jobs as any[]).map((job) => {
              const progress  = job.totalVideos > 0
                ? (((job.completedCount || 0) + (job.failedCount || 0)) / job.totalVideos) * 100
                : 0;
              const isRunning = job.status === "processing" || job.status === "pending";
              const isQuotes  = job.goal === "quotes";
              return (
                <div key={job.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm truncate">{job.niche}</p>
                        {isQuotes && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                            Quotes
                          </span>
                        )}
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {new Date(job.createdAt).toLocaleString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunning && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                          onClick={() => cancelJob.mutate({ id: job.id }, {
                            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() }),
                          })}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1">
                      <Progress value={progress} className="h-1.5" />
                    </div>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap shrink-0">
                      Total: <b className="text-gray-700">{job.totalVideos}</b>
                      {job.completedCount > 0 && <> · Done: <b className="text-emerald-600">{job.completedCount}</b></>}
                      {job.failedCount    > 0 && <> · Failed: <b className="text-red-500">{job.failedCount}</b></>}
                      {isRunning && job.processingCount > 0 && <> · In progress: <b className="text-amber-600">{job.processingCount}</b></>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
