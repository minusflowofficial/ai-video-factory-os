import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useDeleteProject } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { Film, Plus, Trash2, Clock, MonitorPlay, Smartphone, Square } from "lucide-react";
import { cn } from "@/lib/utils";

function ArIcon({ ar }: { ar?: string | null }) {
  if (ar === "9:16") return <Smartphone className="w-3 h-3" />;
  if (ar === "1:1")  return <Square       className="w-3 h-3" />;
  return                      <MonitorPlay  className="w-3 h-3" />;
}

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
      <div className="p-6 max-w-6xl mx-auto">

        {/* Header */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-xl animate-pulse" style={{ height: 220 }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Film className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1.5">No projects yet</h3>
            <p className="text-sm text-gray-400 mb-5">Try a different filter or create your first video.</p>
            <Link href="/studio/new">
              <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Create new project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/studio/${project.id}`}>
                <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-amber-200 hover:shadow-md transition-all cursor-pointer">

                  {/* Thumbnail — always 16:9 container, object-cover fills cleanly */}
                  <div className="aspect-video bg-gray-900 relative overflow-hidden">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <Film className="w-8 h-8 text-gray-600" />
                      </div>
                    )}

                    {/* Gradient overlay at bottom */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Status badge — top right */}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={project.status} />
                    </div>

                    {/* Delete button — top left */}
                    <button
                      onClick={e => handleDelete(project.id, e)}
                      className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white/70 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* AR badge — bottom left */}
                    <div className="absolute bottom-2 left-2">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm",
                        project.aspectRatio === "9:16"
                          ? "bg-purple-500/80 text-white"
                          : project.aspectRatio === "1:1"
                          ? "bg-blue-500/80 text-white"
                          : "bg-black/50 text-white/80",
                      )}>
                        <ArIcon ar={project.aspectRatio} />
                        {project.aspectRatio || "16:9"}
                      </span>
                    </div>

                    {/* Duration — bottom right */}
                    <div className="absolute bottom-2 right-2">
                      <span className="inline-flex items-center gap-1 text-[9px] font-medium bg-black/50 text-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                        <Clock className="w-2.5 h-2.5" />
                        {project.duration || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-3 py-2.5">
                    <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 group-hover:text-amber-700 transition-colors mb-1">
                      {project.title}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(project.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
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
