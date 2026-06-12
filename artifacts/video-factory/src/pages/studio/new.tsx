import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProject } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Loader2, ArrowRight, ArrowLeft, Zap } from "lucide-react";

const CAPTION_STYLES = [
  "Alex Hormozi", "Documentary", "Cinematic", "Modern Minimal", 
  "Gaming", "Luxury", "News", "Educational", "Viral Shorts", 
  "Neon", "Subtitle Pro", "Bold Impact", "Retro Wave", 
  "Gradient Fire", "Clean White", "Corporate", "Hip Hop", 
  "Nature", "Tech Futurism", "Elegant Script"
];

export default function StudioNew() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: "",
    topic: "",
    niche: "",
    duration: "60s",
    aspectRatio: "9:16",
    captionStyle: "Alex Hormozi",
    voiceOption: "Generate",
    voiceGender: "Male",
    voiceLanguage: "English"
  });

  const createProject = useCreateProject();

  const handleNext = () => setStep(s => Math.min(5, s + 1));
  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const handleSubmit = () => {
    createProject.mutate(
      { data: formData },
      {
        onSuccess: (project) => {
          setLocation(`/studio/${project.id}`);
        }
      }
    );
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-white">Create New Project</h1>
          <div className="flex gap-2 mt-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div 
                key={i} 
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-white/10"
                )} 
              />
            ))}
          </div>
        </div>

        <div className="glass-panel p-8 rounded-2xl border border-white/5 bg-black/40">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-semibold">1. Project Basics</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Project Title</label>
                  <Input 
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="E.g., Top 5 Productivity Tips"
                    className="bg-white/5 border-white/10 text-white h-12"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Main Topic / Prompt</label>
                  <Input 
                    value={formData.topic}
                    onChange={e => setFormData({...formData, topic: e.target.value})}
                    placeholder="What is this video about?"
                    className="bg-white/5 border-white/10 text-white h-12"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Target Niche</label>
                  <Input 
                    value={formData.niche}
                    onChange={e => setFormData({...formData, niche: e.target.value})}
                    placeholder="E.g., Tech, Finance, Motivation"
                    className="bg-white/5 border-white/10 text-white h-12"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-semibold">2. Duration</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {["30s", "60s", "90s", "3min", "5min", "Custom"].map((dur) => (
                  <button
                    key={dur}
                    onClick={() => setFormData({...formData, duration: dur})}
                    className={cn(
                      "p-6 rounded-xl border text-center transition-all",
                      formData.duration === dur 
                        ? "border-primary bg-primary/20 text-white" 
                        : "border-white/5 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <span className="text-2xl font-bold font-heading">{dur}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-semibold">3. Aspect Ratio</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { id: "9:16", label: "Shorts/Reels", class: "w-[45px] h-[80px]" },
                  { id: "16:9", label: "YouTube", class: "w-[80px] h-[45px]" },
                  { id: "1:1", label: "Square", class: "w-[60px] h-[60px]" },
                  { id: "4:5", label: "Social", class: "w-[50px] h-[62px]" },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    onClick={() => setFormData({...formData, aspectRatio: ratio.id})}
                    className={cn(
                      "p-6 rounded-xl border flex flex-col items-center gap-4 transition-all",
                      formData.aspectRatio === ratio.id 
                        ? "border-primary bg-primary/20 text-white" 
                        : "border-white/5 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <div className="h-[100px] flex items-center justify-center">
                      <div className={cn("border-2 rounded border-current", ratio.class)} />
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{ratio.id}</div>
                      <div className="text-xs opacity-70">{ratio.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-semibold">4. Caption Style</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {CAPTION_STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => setFormData({...formData, captionStyle: style})}
                    className={cn(
                      "p-4 rounded-xl border text-center transition-all flex items-center justify-center min-h-[100px]",
                      formData.captionStyle === style 
                        ? "border-primary bg-primary/20 text-white" 
                        : "border-white/5 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <span className="font-semibold text-sm leading-tight">{style}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-semibold">5. Voice Settings</h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Audio Type</label>
                  <div className="grid grid-cols-3 gap-4">
                    {["Generate", "Music Only", "No Voice"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setFormData({...formData, voiceOption: opt})}
                        className={cn(
                          "p-4 rounded-xl border text-center transition-all",
                          formData.voiceOption === opt 
                            ? "border-primary bg-primary/20 text-white" 
                            : "border-white/5 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.voiceOption === "Generate" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Voice Gender</label>
                      <Select 
                        value={formData.voiceGender} 
                        onValueChange={(val) => setFormData({...formData, voiceGender: val})}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 h-12">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-white/10">
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Language</label>
                      <Select 
                        value={formData.voiceLanguage} 
                        onValueChange={(val) => setFormData({...formData, voiceLanguage: val})}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 h-12">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-white/10">
                          <SelectItem value="English">English</SelectItem>
                          <SelectItem value="Spanish">Spanish</SelectItem>
                          <SelectItem value="French">French</SelectItem>
                          <SelectItem value="German">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="mt-12 flex justify-between items-center border-t border-white/10 pt-6">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={step === 1 || createProject.isPending}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            {step < 5 ? (
              <Button 
                onClick={handleNext} 
                className="bg-white text-black hover:bg-zinc-200 px-8"
                disabled={step === 1 && !formData.title}
              >
                Next Step
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={createProject.isPending}
                className="bg-primary hover:bg-primary/90 text-white px-8"
              >
                {createProject.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Project
                    <Zap className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
