import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useListProjects } from "@workspace/api-client-react";
import { Film, Plus, Clock, CheckCircle2, Zap, Clapperboard } from "lucide-react";

export default function StudioDashboard() {
  const { data: projects = [], isLoading } = useListProjects();

  const total = projects.length;
  const completed = projects.filter(p => p.status === "completed").length;
  const inProgress = projects.filter(p =>
    ["scripting", "fetching-assets", "voiceover", "rendering"].includes(p.status)
  ).length;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Studio</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your video projects</p>
          </div>
          <Link href="/studio/new">
            <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs h-8">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Project
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total projects", value: total,      icon: Clapperboard, color: "text-gray-600" },
            { label: "Completed",      value: completed,  icon: CheckCircle2, color: "text-emerald-600" },
            { label: "In progress",    value: inProgress, icon: Zap,          color: "text-amber-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Recent Projects</h2>
          <Link href="/projects" className="text-xs text-amber-600 hover:text-amber-700 font-medium">View all</Link>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 border-dashed p-14 text-center">
            <Film className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-medium text-gray-700 mb-1">No projects yet</h3>
            <p className="text-sm text-gray-400 mb-5">Create your first video project to get started.</p>
            <Link href="/studio/new">
              <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs">
                Create first project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 9).map((p) => (
              <Link key={p.id} href={`/studio/${p.id}`}>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-amber-200 hover:shadow-sm transition-all cursor-pointer group">
                  <div className="aspect-video bg-gray-50 relative flex items-center justify-center overflow-hidden">
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Film className="w-7 h-7 text-gray-300" />
                    )}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-gray-900 text-sm truncate group-hover:text-amber-700 transition-colors">{p.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.duration}</span>
                      <span>{p.aspectRatio}</span>
                      <span className="ml-auto">{new Date(p.createdAt).toLocaleDateString()}</span>
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
