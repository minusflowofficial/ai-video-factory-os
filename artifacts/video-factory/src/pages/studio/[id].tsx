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
import { Play, Settings2, Download, Zap, RefreshCw, FileText, Music, Image as ImageIcon, CheckCircle2, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

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
  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (project && initRef.current !== project.id) {
      setLocalScript(project.script || "");
      initRef.current = project.id;
    }
  }, [project]);

  const handleSaveScript = () => {
    updateProject.mutate({
      id,
      data: { script: localScript }
    }, {
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

  // Parse JSON data safely
  let scenes: any[] = [];
  let keywords: string[] = [];
  let assets: any[] = [];
  try { if (project.scenes) scenes = JSON.parse(project.scenes); } catch(e){}
  try { if (project.keywords) keywords = JSON.parse(project.keywords); } catch(e){}
  try { if (project.assets) assets = JSON.parse(project.assets); } catch(e){}

  return (
    <AppLayout>
      <div className="h-[calc(100vh-64px)] flex overflow-hidden">
        
        {/* Column 1: Control Pipeline */}
        <div className="w-[300px] border-r border-white/5 bg-black/40 flex flex-col">
          <div className="p-4 border-b border-white/5">
            <h2 className="font-heading font-bold text-lg text-white mb-2 truncate">{project.title}</h2>
            <StatusBadge status={project.status} />
          </div>
          
          <div className="p-4 space-y-6 flex-1 overflow-y-auto">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Project Settings</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded p-2 text-zinc-400">Ratio: <span className="text-white">{project.aspectRatio}</span></div>
                <div className="bg-white/5 rounded p-2 text-zinc-400">Dur: <span className="text-white">{project.duration}</span></div>
                <div className="bg-white/5 rounded p-2 text-zinc-400">Voice: <span className="text-white">{project.voiceGender}</span></div>
                <div className="bg-white/5 rounded p-2 text-zinc-400">Lang: <span className="text-white">{project.voiceLanguage}</span></div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Pipeline</h3>
              
              <div className="space-y-2">
                <Button 
                  onClick={() => handleAction(genScript)} 
                  disabled={genScript.isPending || ['scripting'].includes(project.status)}
                  variant="outline" 
                  className="w-full justify-between border-white/10 hover:bg-white/5 h-12"
                >
                  <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> 1. Generate Script</span>
                  {project.script ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Play className="w-3 h-3" />}
                </Button>
                
                <Button 
                  onClick={() => handleAction(genAssets)} 
                  disabled={genAssets.isPending || !project.script || ['generating_assets'].includes(project.status)}
                  variant="outline" 
                  className="w-full justify-between border-white/10 hover:bg-white/5 h-12"
                >
                  <span className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> 2. Fetch Assets</span>
                  {project.assets ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Play className="w-3 h-3" />}
                </Button>

                <Button 
                  onClick={() => handleAction(genVoice)} 
                  disabled={genVoice.isPending || !project.script || ['generating_voice'].includes(project.status)}
                  variant="outline" 
                  className="w-full justify-between border-white/10 hover:bg-white/5 h-12"
                >
                  <span className="flex items-center gap-2"><Music className="w-4 h-4" /> 3. Generate Voice</span>
                  {project.voiceoverUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Play className="w-3 h-3" />}
                </Button>

                <div className="pt-4 mt-4 border-t border-white/5">
                  <Button 
                    onClick={() => handleAction(renderVid)} 
                    disabled={renderVid.isPending || project.status === 'rendering'}
                    className="w-full justify-between bg-primary hover:bg-primary/90 text-white h-14 rounded-xl"
                  >
                    <span className="flex items-center gap-2 font-bold text-lg"><Zap className="w-5 h-5" /> Render Video</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Script Editor */}
        <div className="flex-1 border-r border-white/5 flex flex-col bg-[#0a0a0f]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Script Editor
            </h3>
            <Button onClick={handleSaveScript} disabled={updateProject.isPending} size="sm" variant="outline" className="h-8">
              {updateProject.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto">
            <textarea 
              value={localScript}
              onChange={(e) => setLocalScript(e.target.value)}
              placeholder="Your video script will appear here. You can manually edit it before rendering."
              className="w-full h-full min-h-[400px] bg-transparent border-0 resize-none focus:ring-0 text-zinc-300 leading-relaxed p-2"
            />
          </div>
          
          {keywords.length > 0 && (
            <div className="p-4 border-t border-white/5 bg-black/20">
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-1 bg-white/5 rounded text-xs text-zinc-400">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Assets & Timeline */}
        <div className="w-[300px] border-r border-white/5 bg-black/20 flex flex-col">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-heading font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" /> Media Assets
            </h3>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {assets.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No assets generated yet.<br/>Run "Fetch Assets" step.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {assets.map((asset, i) => (
                  <div key={i} className="aspect-video bg-zinc-900 rounded border border-white/10 overflow-hidden relative group cursor-pointer">
                    <img src={asset.url || asset.thumbnail} alt={`Asset ${i}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <RefreshCw className="w-4 h-4 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {scenes.length > 0 && (
              <div className="mt-8">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Detected Scenes</h4>
                <div className="space-y-2">
                  {scenes.map((scene, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded border border-white/5 text-sm text-zinc-300">
                      <span className="text-violet-400 font-bold mr-2">{i+1}.</span>
                      {scene.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Output Preview */}
        <div className="w-[400px] bg-[#050508] flex flex-col relative">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-violet-400" /> Output Preview
            </h3>
          </div>
          
          <div className="flex-1 p-6 flex flex-col items-center justify-center">
            {/* Aspect Ratio Container */}
            <div className={cn(
              "bg-black border border-white/10 rounded-lg overflow-hidden shadow-2xl relative flex items-center justify-center",
              project.aspectRatio === '9:16' ? "w-[240px] h-[426px]" : 
              project.aspectRatio === '1:1' ? "w-[300px] h-[300px]" : 
              "w-[340px] h-[191px]"
            )}>
              {project.videoUrl ? (
                <video src={project.videoUrl} controls className="w-full h-full object-cover" />
              ) : project.thumbnailUrl ? (
                <img src={project.thumbnailUrl} className="w-full h-full object-cover opacity-50" alt="Thumbnail" />
              ) : (
                <div className="text-center p-4">
                  <Play className="w-12 h-12 text-zinc-800 mx-auto mb-2" />
                  <p className="text-zinc-600 text-sm font-medium">No video generated</p>
                </div>
              )}
              
              {project.status === 'rendering' && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
                  <div className="w-full max-w-[200px] space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Rendering...</span>
                      <span className="text-white font-mono">{project.renderProgress || 0}%</span>
                    </div>
                    <Progress value={project.renderProgress || 0} className="h-2" />
                  </div>
                </div>
              )}
            </div>
            
            {project.videoUrl && (
              <Button className="mt-8 w-full max-w-[240px] bg-white text-black hover:bg-zinc-200">
                <Download className="w-4 h-4 mr-2" /> Download MP4
              </Button>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
