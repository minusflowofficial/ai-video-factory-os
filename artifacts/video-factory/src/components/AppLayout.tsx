import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Clapperboard, LayoutDashboard, FolderOpen, ListVideo, Settings, Plus, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

const NAV = [
  { name: "Studio",       href: "/studio",   icon: LayoutDashboard },
  { name: "Projects",     href: "/projects", icon: FolderOpen },
  { name: "Bulk Factory", href: "/bulk",      icon: ListVideo },
  { name: "Clipper",      href: "/clipper",  icon: Scissors },
  { name: "Settings",     href: "/settings", icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-52 bg-white border-r border-gray-100 flex flex-col shrink-0">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-gray-100">
          <div className="w-7 h-7 rounded-md bg-amber-400 flex items-center justify-center shrink-0">
            <Clapperboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm leading-tight">AI Video Factory</span>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                  active
                    ? "bg-amber-50 text-amber-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}>
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-amber-600" : "text-gray-400")} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <Link href="/studio/new">
            <Button size="sm" className="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs h-8">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Video
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
