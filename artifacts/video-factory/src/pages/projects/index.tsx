import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useDeleteProject } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { Video, Search, Trash2, Calendar, Clock, Layout } from "lucide-react";

export default function ProjectsHistory() {
  const [filter, setFilter] = useState("all");
  
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useListProjects(
    filter !== "all" ? { status: filter } : undefined
  );
  
  const deleteProject = useDeleteProject();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to the project
    if (confirm("Are you sure you want to delete this project?")) {
      deleteProject.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        }
      });
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-white mb-2">Project History</h1>
            <p className="text-zinc-400">Manage and review all your generated videos.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px] bg-black/40 border-white/10 text-white">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0f] border-white/10">
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scripting">Scripting</SelectItem>
                <SelectItem value="rendering">Rendering</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="glass-panel border border-white/5 rounded-xl p-16 text-center max-w-2xl mx-auto mt-12">
            <Search className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No projects found</h3>
            <p className="text-zinc-400 mb-6">Create a new project or adjust your filters.</p>
            <Link href="/studio/new">
              <Button className="bg-primary text-white">Create New Project</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 lg:grid-cols-4 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/studio/${project.id}`}>
                <div className="glass-panel border border-white/10 rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 group cursor-pointer h-full flex flex-col hover:-translate-y-1 shadow-lg hover:shadow-primary/10">
                  <div className={cn(
                    "bg-black relative flex-shrink-0 flex items-center justify-center overflow-hidden",
                    project.aspectRatio === '9:16' ? "aspect-[9/16] max-h-[300px]" : "aspect-video"
                  )}>
                    {project.thumbnailUrl ? (
                      <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Video className="w-10 h-10 text-zinc-800" />
                    )}
                    
                    {/* Overlays */}
                    <div className="absolute top-3 right-3">
                      <StatusBadge status={project.status} />
                    </div>
                    
                    {/* Hover Delete Button */}
                    <button 
                      onClick={(e) => handleDelete(project.id, e)}
                      className="absolute top-3 left-3 w-8 h-8 rounded-md bg-black/60 text-zinc-400 hover:text-red-400 hover:bg-red-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="font-heading font-semibold text-white mb-2 text-lg line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {project.title}
                    </h3>
                    
                    <div className="mt-auto pt-4 flex items-center gap-4 text-xs text-zinc-400">
                      <div className="flex items-center gap-1.5" title="Date">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1.5" title="Duration">
                        <Clock className="w-3.5 h-3.5" />
                        {project.duration || 'Auto'}
                      </div>
                      <div className="flex items-center gap-1.5" title="Format">
                        <Layout className="w-3.5 h-3.5" />
                        {project.aspectRatio || '16:9'}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Utility function inline since it's not exported globally
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
