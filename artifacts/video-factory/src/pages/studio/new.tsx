import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProject } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Loader2, Zap } from "lucide-react";

const DURATIONS = ["30s", "60s", "90s", "3min", "5min"];
const FORMATS = [
  { id: "9:16",  label: "Shorts / Reels" },
  { id: "16:9",  label: "YouTube / Wide" },
  { id: "1:1",   label: "Square / Feed" },
];

export default function StudioNew() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    title: "",
    topic: "",
    niche: "",
    duration: "60s",
    aspectRatio: "9:16",
    captionStyle: "Modern Minimal",
    voiceGender: "female",
    voiceLanguage: "en-US",
  });

  const createProject = useCreateProject();

  const handleSubmit = () => {
    createProject.mutate({ data: form }, {
      onSuccess: (project) => setLocation(`/studio/${project.id}`),
    });
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">New Project</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fill in the details and create your project</p>
        </div>

        <div className="space-y-5">
          {/* Title + Topic */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Project basics</h2>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Title <span className="text-red-400">*</span></label>
              <Input
                value={form.title}
                onChange={e => set("title", e.target.value)}
                placeholder="E.g., Top 5 Productivity Tips for 2025"
                className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Topic / Prompt</label>
              <Input
                value={form.topic}
                onChange={e => set("topic", e.target.value)}
                placeholder="What is this video about?"
                className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Niche</label>
              <Input
                value={form.niche}
                onChange={e => set("niche", e.target.value)}
                placeholder="E.g., Tech, Finance, Fitness, Motivation"
                className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Duration</h2>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  onClick={() => set("duration", d)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    form.duration === d
                      ? "bg-amber-400 border-amber-400 text-amber-950"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >{d}</button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Format</h2>
            <div className="flex gap-3">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => set("aspectRatio", f.id)}
                  className={cn(
                    "flex-1 py-3 rounded-lg border text-center transition-colors",
                    form.aspectRatio === f.id
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  <span className="block font-semibold text-sm">{f.id}</span>
                  <span className="block text-xs mt-0.5 opacity-70">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Voice</h2>
            <div className="flex gap-2">
              {["male", "female"].map(g => (
                <button
                  key={g}
                  onClick={() => set("voiceGender", g)}
                  className={cn(
                    "px-5 py-1.5 rounded-lg border text-sm font-medium capitalize transition-colors",
                    form.voiceGender === g
                      ? "bg-amber-400 border-amber-400 text-amber-950"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >{g}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!form.title || createProject.isPending}
            className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold h-9 px-6"
          >
            {createProject.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              : <><Zap className="w-4 h-4 mr-2" />Create Project</>
            }
          </Button>
          <Button variant="ghost" onClick={() => history.back()} className="h-9 text-sm text-gray-500">
            Cancel
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
