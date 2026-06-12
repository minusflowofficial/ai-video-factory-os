import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useDeleteProject } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { Film, Plus, Trash2, Clock, Layout } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProjectsHistory() {
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useListProjects(filter !== "all" ? { status: filter } : undefined);
  const deleteProject = useDeleteProject();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm("Delete this project?")) {
      deleteProject.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })
      });
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">All your generated videos</p>
          </div>
          <div className="flex items-center gap-2">
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
            <Link href="/studio/new">
              <Button size="sm" className="h-8 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 border-dashed">
            <Film className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-medium text-gray-700 mb-1">No projects found</h3>
            <p className="text-sm text-gray-400 mb-4">Try a different filter or create a new project.</p>
            <Link href="/studio/new">
              <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                Create new project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/studio/${project.id}`}>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-amber-200 hover:shadow-sm transition-all cursor-pointer group">
                  <div className={cn(
                    "bg-gray-100 relative flex items-center justify-center overflow-hidden",
                    project.aspectRatio === "9:16" ? "aspect-[9/16] max-h-64" : "aspect-video"
                  )}>
                    {project.thumbnailUrl ? (
                      <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Film className="w-8 h-8 text-gray-300" />
                    )}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={project.status} />
                    </div>
                    <button
                      onClick={e => handleDelete(project.id, e)}
                      className="absolute top-2 left-2 w-7 h-7 rounded bg-white/80 text-gray-400 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-gray-900 text-sm truncate group-hover:text-amber-700 transition-colors">{project.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{project.duration || "Auto"}</span>
                      <span className="flex items-center gap-1"><Layout className="w-3 h-3" />{project.aspectRatio}</span>
                      <span className="ml-auto">{new Date(project.createdAt).toLocaleDateString()}</span>
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
