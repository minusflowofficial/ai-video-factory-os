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
import { Zap, XCircle, ListVideo, Search, Clock } from "lucide-react";

export default function BulkFactory() {
  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading } = useListBulkJobs(undefined, { 
    query: { refetchInterval: 5000 } 
  });
  
  const createJob = useCreateBulkJob();
  const cancelJob = useCancelBulkJob();

  const [formData, setFormData] = useState({
    niche: "",
    goal: "",
    totalVideos: "50",
    duration: "60s",
    aspectRatio: "9:16"
  });

  const handleSubmit = () => {
    if (!formData.niche) return;
    
    createJob.mutate({
      data: {
        niche: formData.niche,
        goal: formData.goal,
        totalVideos: parseInt(formData.totalVideos, 10),
        duration: formData.duration,
        aspectRatio: formData.aspectRatio
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() });
        setFormData(prev => ({...prev, niche: "", goal: ""}));
      }
    });
  };

  const handleCancel = (id: number) => {
    cancelJob.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBulkJobsQueryKey() });
      }
    });
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
              <ListVideo className="w-8 h-8 text-amber-400" />
              Bulk Factory
            </h1>
            <p className="text-zinc-400 mt-2">Generate dozens of videos asynchronously.</p>
          </div>
        </div>

        {/* Create Form */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-10">
          <h2 className="text-lg font-heading font-bold text-white mb-4">Start New Batch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Niche / Topic</label>
              <Input 
                value={formData.niche}
                onChange={e => setFormData({...formData, niche: e.target.value})}
                placeholder="E.g., Stoic Philosophy Quotes"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>
            <div className="lg:col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Quantity</label>
              <Select value={formData.totalVideos} onValueChange={v => setFormData({...formData, totalVideos: v})}>
                <SelectTrigger className="bg-black/50 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#080b10] border-white/10">
                  <SelectItem value="10">10 Videos</SelectItem>
                  <SelectItem value="50">50 Videos</SelectItem>
                  <SelectItem value="100">100 Videos</SelectItem>
                  <SelectItem value="250">250 Videos</SelectItem>
                  <SelectItem value="500">500 Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Format</label>
              <Select value={formData.aspectRatio} onValueChange={v => setFormData({...formData, aspectRatio: v})}>
                <SelectTrigger className="bg-black/50 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#080b10] border-white/10">
                  <SelectItem value="9:16">9:16 Shorts</SelectItem>
                  <SelectItem value="16:9">16:9 Landscape</SelectItem>
                  <SelectItem value="1:1">1:1 Square</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-1 flex items-end">
              <Button 
                onClick={handleSubmit}
                disabled={!formData.niche || createJob.isPending}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
              >
                <Zap className="w-4 h-4 mr-2" />
                Queue Job
              </Button>
            </div>
          </div>
        </div>

        {/* Job Queue */}
        <div>
          <h2 className="text-xl font-heading font-bold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" /> Job Queue
          </h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-zinc-500">Loading queue...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 bg-black/20 rounded-xl border border-white/5 border-dashed">
              <Search className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No active or past bulk jobs. Queue your first batch above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const isRunning = job.status === 'processing' || job.status === 'pending';
                const progress = job.totalVideos > 0 
                  ? ((job.completedCount || 0) + (job.failedCount || 0)) / job.totalVideos * 100 
                  : 0;

                return (
                  <div key={job.id} className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1 w-full min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-heading font-bold text-white truncate text-lg">{job.niche}</h3>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-400 mb-3">
                        <span>Total: <strong>{job.totalVideos}</strong></span>
                        <span className="text-emerald-400">Done: <strong>{job.completedCount || 0}</strong></span>
                        {job.failedCount ? <span className="text-red-400">Failed: <strong>{job.failedCount}</strong></span> : null}
                        <span>{new Date(job.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="w-full">
                        <Progress value={progress} className="h-2" />
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 flex items-center gap-3 w-full md:w-auto">
                      {isRunning && (
                        <Button 
                          onClick={() => handleCancel(job.id)}
                          disabled={cancelJob.isPending}
                          variant="ghost" 
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        >
                          <XCircle className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
