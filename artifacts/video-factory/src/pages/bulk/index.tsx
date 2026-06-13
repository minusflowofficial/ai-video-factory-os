import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { useListBulkJobs, useCreateBulkJob, useCancelBulkJob } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBulkJobsQueryKey } from "@workspace/api-client-react";
import { Zap, XCircle, Film, Quote, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

type JobMode = "standard" | "quotes";

export default function BulkFactory() {
  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading } = useListBulkJobs({ query: { queryKey: ["bulk-jobs"], refetchInterval: 5000 } });
  const createJob = useCreateBulkJob();
  const cancelJob = useCancelBulkJob();

  const [mode, setMode] = useState<JobMode>("standard");
  const [form, setForm] = useState({ niche: "", totalVideos: "10", aspectRatio: "9:16" });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.niche) return;
    createJob.mutate(
      {
        data: {
          niche: form.niche,
          goal: mode === "quotes" ? "quotes" : undefined,
          totalVideos: parseInt(form.totalVideos, 10),
          aspectRatio: form.aspectRatio,
          duration: "60s",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() });
          set("niche", "");
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
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8">
          {mode === "quotes" ? (
            <div className="mb-4 flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Quote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Bulk Quotes Mode</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  AI generates unique inspiring quotes, each rendered on a cinematic background with bold golden text + music. Perfect for motivational / quote channels.
                </p>
              </div>
            </div>
          ) : null}

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

            <Button
              onClick={handleSubmit}
              disabled={!form.niche || createJob.isPending}
              className="h-9 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-sm"
            >
              {mode === "quotes"
                ? <><Quote className="w-4 h-4 mr-1.5" /> Generate Quotes</>
                : <><Zap className="w-4 h-4 mr-1.5" /> Queue Job</>
              }
            </Button>
          </div>
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
            {jobs.map((job) => {
              const progress = job.totalVideos > 0
                ? (((job.completedCount || 0) + (job.failedCount || 0)) / job.totalVideos) * 100
                : 0;
              const isRunning = job.status === "processing" || job.status === "pending";
              const isQuotes  = job.goal === "quotes";
              return (
                <div key={job.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">{job.niche}</p>
                          {isQuotes && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              <Quote className="w-2.5 h-2.5" /> Quotes
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(job.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.status} />
                      {isRunning && (
                        <button
                          onClick={() => cancelJob.mutate({ id: job.id }, {
                            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() }),
                          })}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                    <span>Total: <strong className="text-gray-800">{job.totalVideos}</strong></span>
                    <span className="text-emerald-600">Done: <strong>{job.completedCount || 0}</strong></span>
                    {(job.processingCount || 0) > 0 && (
                      <span className="text-blue-500">In progress: <strong>{job.processingCount}</strong></span>
                    )}
                    {(job.failedCount || 0) > 0 && (
                      <span className="text-red-500">Failed: <strong>{job.failedCount}</strong></span>
                    )}
                  </div>

                  <Progress value={progress} className="h-1.5" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
