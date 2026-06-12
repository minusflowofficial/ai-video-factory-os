import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Video, BarChart3, Clock, Zap, PlusCircle } from "lucide-react";
import { useListProjects } from "@workspace/api-client-react";

export default function StudioDashboard() {
  const { data: projects = [], isLoading } = useListProjects();
  
  // Mock stats since useGetStats might not be implemented in the backend yet
  const stats = {
    totalProjects: projects.length || 0,
    completedVideos: projects.filter(p => p.status === 'completed').length || 0,
    processingVideos: projects.filter(p => ['scripting', 'generating_assets', 'rendering'].includes(p.status)).length || 0,
    totalMinutes: "124",
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-white mb-2">Studio Dashboard</h1>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>Active AI Pipeline:</span>
              <div className="flex items-center gap-1 font-mono text-xs bg-white/5 px-2 py-1 rounded">
                <span className="text-blue-400">Gemini</span>
                <span>→</span>
                <span className="text-green-400">OpenAI</span>
                <span>→</span>
                <span className="text-orange-400">Claude</span>
              </div>
            </div>
          </div>
          <Link href="/studio/new">
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
              <PlusCircle className="w-4 h-4" />
              New Project
            </Button>
          </Link>
        </div>

        {/* 4 Column Layout for Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="glass-panel p-6 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-zinc-400 font-medium">Total Projects</h3>
              <Video className="w-5 h-5 text-violet-400" />
            </div>
            <p className="text-3xl font-bold font-heading">{stats.totalProjects}</p>
          </div>
          
          <div className="glass-panel p-6 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-zinc-400 font-medium">Completed</h3>
              <BarChart3 className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold font-heading">{stats.completedVideos}</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-zinc-400 font-medium">Processing</h3>
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <p className="text-3xl font-bold font-heading">{stats.processingVideos}</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-zinc-400 font-medium">Minutes Rendered</h3>
              <Clock className="w-5 h-5 text-cyan-400" />
            </div>
            <p className="text-3xl font-bold font-heading">{stats.totalMinutes}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-heading font-bold text-white">Recent Projects</h2>
            <Link href="/projects" className="text-sm text-primary hover:text-primary/80 transition-colors">
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-zinc-500">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="glass-panel border border-white/5 rounded-xl p-12 text-center">
              <Video className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
              <p className="text-zinc-400 mb-6">Create your first AI-generated video project.</p>
              <Link href="/studio/new">
                <Button className="bg-primary text-white">Create Project</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.slice(0, 6).map((project) => (
                <Link key={project.id} href={`/studio/${project.id}`}>
                  <div className="glass-panel border border-white/5 rounded-xl overflow-hidden hover:border-primary/50 transition-colors group cursor-pointer">
                    <div className="aspect-video bg-zinc-900 relative">
                      {project.thumbnailUrl ? (
                        <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                          <Video className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <StatusBadge status={project.status} />
                      </div>
                      <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 rounded text-xs font-mono text-white">
                        {project.duration || 'Auto'}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading font-semibold text-white mb-1 group-hover:text-primary transition-colors truncate">
                        {project.title}
                      </h3>
                      <div className="flex items-center justify-between text-sm text-zinc-400">
                        <span>{project.topic || 'No topic'}</span>
                        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
