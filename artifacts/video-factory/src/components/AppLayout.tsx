import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Video, Sparkles, Zap, LayoutDashboard, LayoutList, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Studio", href: "/studio", icon: LayoutDashboard },
    { name: "Projects", href: "/projects", icon: Video },
    { name: "Bulk Factory", href: "/bulk", icon: LayoutList },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-xl tracking-tight">AI Video Factory</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/5",
                    location === item.href || (item.href !== "/" && location.startsWith(item.href))
                      ? "text-white bg-white/10"
                      : "text-zinc-400 hover:text-white"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/studio/new">
              <Button className="bg-primary hover:bg-primary/90 text-white border-0">
                <Zap className="w-4 h-4 mr-2" />
                New Video
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full bg-[#0a0a0f]">{children}</main>
    </div>
  );
}
