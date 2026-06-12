import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { 
  useGetProject, useUpdateProject, useGenerateScript, 
  useGenerateAssets, useGenerateVoiceover, useRenderProject 
} from "@workspace/api-client-react";
import { Play, Download, Zap, RefreshCw, FileText, Music2, Image as ImageIcon, CheckCircle2, Video, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

// Curated Mixkit music tracks — no key required
const MIXKIT_MUSIC = [
  { id: 738,  title: "Epic Cinematic Opener",  mood: "Dramatic",    duration: "2:14" },
  { id: 739,  title: "Inspiring Journey",       mood: "Uplifting",   duration: "2:32" },
  { id: 740,  title: "Corporate Success",        mood: "Professional",duration: "2:05" },
  { id: 741,  title: "Epic Motivation",          mood: "Energetic",   duration: "1:58" },
  { id: 837,  title: "Ambient Digital",          mood: "Chill",       duration: "3:12" },
  { id: 838,  title: "Digital Pulse",            mood: "Tech",        duration: "2:44" },
  { id: 843,  title: "Victory Fanfare",          mood: "Triumphant",  duration: "1:30" },
  { id: 872,  title: "Lo-Fi Afternoon",          mood: "Relaxed",     duration: "2:58" },
  { id: 873,  title: "Soft Background",          mood: "Subtle",      duration: "3:05" },
  { id: 912,  title: "Upbeat Pop Intro",         mood: "Fun",         duration: "1:45" },
];

export default function StudioEditor() {
  const [, params] = useRoute("/studio/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const queryClient = useQueryClient();
  const { data: project, isLoading } = useGetProject(id, { query: { enabled: !!id } });
  
  const updateProject = useUpdateProject();
  const genScript = useGenerateScript();
  const genAssets = useGenerateAssets();
  const genVoice = useGenerateVoiceover();
  const renderVid = useRenderProject();

  const [localScript, setLocalScript] = useState("");
  const [assetTab, setAssetTab] = useState<"videos" | "music">("videos");
  const [playingTrack, setPlayingTrack] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (project && initRef.current !== project.id) {
      setLocalScript(project.script || "");
      initRef.current = project.id;
    }
  }, [project]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const togglePlay = (trackId: number) => {
    const url = `https://assets.mixkit.co/music/${trackId}/${trackId}.mp3`;
    if (playingTrack === trackId) {
      audioRef.current?.pause();
      setPlayingTrack(null);
    } else {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = url; }
      else { audioRef.current = new Audio(url); }
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
      audioRef.current.onended = () => setPlayingTrack(null);
      setPlayingTrack(trackId);
    }
  };

  const handleSaveScript = () => {
    updateProject.mutate({ id, data: { script: localScript } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetProjectQueryKey(id), updated);
      }
    });
  };

  const handleAction = (mutation: any) => {
    mutation.mutate({ id }, {
      onSuccess: (updated: any) => {
        queryClient.setQueryData(getGetProjectQueryKey(id), updated);
      }
    });
  };

  if (isLoading || !project) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  let scenes: any[] = [];
  let assets: any[] = [];
  try { if (project.scenes) scenes = JSON.parse(project.scenes); } catch(e){}
  try { if (project.assets) assets = JSON.parse(project.assets); } catch(e){}

  const pipeline = [
    { label: "1. Generate Script", mutation: genScript, doneStatus: ["scripting", "fetching-assets", "voiceover", "rendering", "completed"] },
    { label: "2. Fetch Assets",    mutation: genAssets,  doneStatus: ["fetching-assets", "voiceover", "rendering", "completed"] },
    { label: "3. Generate Voice",  mutation: genVoice,   doneStatus: ["voiceover", "rendering", "completed"] },
  ];

  return (
    <AppLayout>
      <div className="h-[calc(100vh-64px)] flex overflow-hidden">
        
        {/* Column 1: Pipeline Controls */}
        <div className="w-[280px] border-r border-white/5 bg-black/50 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5">
            <h2 className="font-heading font-bold text-lg text-white mb-1.5 truncate">{project.title}</h2>
            <StatusBadge status={project.status} />
          </div>
          
          <div className="p-4 space-y-5 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Project Settings</h3>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                <div className="bg-white/5 rounded-lg p-2 text-zinc-400">Ratio: <span className="text-white font-medium">{project.aspectRatio}</span></div>
                <div className="bg-white/5 rounded-lg p-2 text-zinc-400">Dur: <span className="text-white font-medium">{project.duration}</span></div>
                <div className="bg-white/5 rounded-lg p-2 text-zinc-400">Voice: <span className="text-white font-medium">{project.voiceGender}</span></div>
                <div className="bg-white/5 rounded-lg p-2 text-zinc-400">Lang: <span className="text-white font-medium">{project.voiceLanguage}</span></div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Pipeline</h3>
              <div className="space-y-1.5">
                {pipeline.map(({ label, mutation, doneStatus }) => {
                  const done = doneStatus.includes(project.status);
                  return (
                    <button
                      key={label}
                      onClick={() => handleAction(mutation)}
                      disabled={mutation.isPending}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        done
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-white/5 text-zinc-300 border border-white/8 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        {label}
                      </span>
                      {!done && (
                        mutation.isPending
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/5">
            <Button
              onClick={() => handleAction(renderVid)}
              disabled={renderVid.isPending || project.status === 'rendering'}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
            >
              <span className="flex items-center gap-2 font-bold text-base">
                <Zap className="w-5 h-5" /> Render Video
              </span>
            </Button>
          </div>
        </div>

        {/* Column 2: Script Editor */}
        <div className="flex-1 border-r border-white/5 flex flex-col min-w-0">
          <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
            <h3 className="font-heading font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" /> Script Editor
            </h3>
            <Button 
              size="sm" 
              onClick={handleSaveScript}
              disabled={updateProject.isPending}
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs"
            >
              {updateProject.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </div>
          
          <textarea
            value={localScript}
            onChange={(e) => setLocalScript(e.target.value)}
            placeholder="Generate a script using the pipeline, or type your own..."
            className="flex-1 w-full resize-none bg-transparent text-zinc-200 p-5 text-sm leading-relaxed focus:outline-none placeholder:text-zinc-600 font-mono"
          />

          {scenes.length > 0 && (
            <div className="border-t border-white/5 p-4 space-y-2 max-h-[200px] overflow-y-auto shrink-0">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Scene Breakdown</h4>
              {scenes.map((scene, i) => (
                <div key={i} className="p-2.5 bg-white/4 rounded-lg border border-white/5 text-xs text-zinc-300">
                  <span className="text-amber-400 font-bold mr-2">Scene {i+1}</span>
                  {scene.visualIntent}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: Media Assets (Videos + Music) */}
        <div className="w-[320px] border-r border-white/5 flex flex-col shrink-0">
          {/* Tab header */}
          <div className="p-3 border-b border-white/5 shrink-0">
            <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
              <button
                onClick={() => setAssetTab("videos")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all",
                  assetTab === "videos" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" /> B-Roll
              </button>
              <button
                onClick={() => setAssetTab("music")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all",
                  assetTab === "music" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Music2 className="w-3.5 h-3.5" /> Music
              </button>
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto">
            {assetTab === "videos" ? (
              <>
                {assets.length === 0 ? (
                  <div className="text-center py-10 text-zinc-500 text-sm">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No assets yet.<br/>Run "Fetch Assets" step.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 mb-3">
                      {assets.length} Mixkit clips · Click to preview
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {assets.map((asset, i) => (
                        <div
                          key={i}
                          className="aspect-video bg-zinc-900 rounded-lg border border-white/8 overflow-hidden relative group cursor-pointer"
                        >
                          <img
                            src={asset.thumbnail}
                            alt={`Clip ${i + 1}`}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-5 h-5 text-white" fill="white" />
                          </div>
                          <div className="absolute bottom-1 left-1 bg-black/70 text-[10px] text-zinc-300 px-1.5 py-0.5 rounded font-mono">
                            #{asset.mixkitId}
                          </div>
                        </div>
                      ))}
                    </div>
                    {scenes.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Scenes</h4>
                        {scenes.map((scene, i) => (
                          <div key={i} className="p-2 bg-white/4 rounded-lg border border-white/5 text-xs text-zinc-300">
                            <span className="text-amber-400 font-bold mr-2">{i+1}.</span>
                            {scene.description || scene.visualIntent}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-zinc-500 mb-3">
                  Mixkit free tracks · Click ▶ to preview
                </p>
                {MIXKIT_MUSIC.map((track) => {
                  const isPlaying = playingTrack === track.id;
                  const isSelected = selectedTrack === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => setSelectedTrack(track.id)}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all",
                        isSelected
                          ? "bg-primary/10 border-primary/30 text-white"
                          : "bg-white/4 border-white/6 hover:bg-white/8 text-zinc-300"
                      )}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePlay(track.id); }}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors",
                          isPlaying ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"
                        )}
                      >
                        {isPlaying
                          ? <Pause className="w-3 h-3" fill="currentColor" />
                          : <Play className="w-3 h-3" fill="currentColor" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{track.title}</p>
                        <p className="text-[10px] text-zinc-500">{track.mood} · {track.duration}</p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Output Preview */}
        <div className="w-[380px] bg-black/60 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-amber-400" /> Output Preview
            </h3>
          </div>
          
          <div className="flex-1 p-6 flex flex-col items-center justify-center">
            <div className={cn(
              "bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center",
              project.aspectRatio === '9:16' ? "w-[220px] h-[390px]" : 
              project.aspectRatio === '1:1' ? "w-[280px] h-[280px]" : 
              "w-[320px] h-[180px]"
            )}>
              {project.videoUrl ? (
                <video src={project.videoUrl} controls className="w-full h-full object-cover" />
              ) : project.thumbnailUrl ? (
                <img src={project.thumbnailUrl} className="w-full h-full object-cover opacity-50" alt="Thumbnail" />
              ) : (
                <div className="text-center p-4">
                  <Play className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-600 text-xs font-medium">No video yet</p>
                </div>
              )}
              
              {project.status === 'rendering' && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
                  <div className="w-full max-w-[180px] space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Rendering...</span>
                      <span className="text-white font-mono">{project.renderProgress || 0}%</span>
                    </div>
                    <Progress value={project.renderProgress || 0} className="h-1.5" />
                  </div>
                </div>
              )}
            </div>

            {selectedTrack && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-xs text-amber-300">
                <Music2 className="w-3.5 h-3.5" />
                <span className="font-medium">
                  {MIXKIT_MUSIC.find(t => t.id === selectedTrack)?.title}
                </span>
              </div>
            )}
            
            {project.videoUrl && (
              <Button className="mt-5 w-full max-w-[220px] bg-white/10 hover:bg-white/15 text-white border border-white/10">
                <Download className="w-4 h-4 mr-2" /> Download MP4
              </Button>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
