import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const [location] = useLocation();

  const nav = [
    { name: "Features", href: "/features" },
    { name: "Pricing",  href: "/pricing" },
    { name: "About",    href: "/about" },
    { name: "Contact",  href: "/contact" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-md bg-amber-400 flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">AI Video Factory</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={cn(
                "text-sm transition-colors",
                location === item.href ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900"
              )}>
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/studio" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/studio">
              <Button size="sm" className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs h-8 px-4">
                Get started free →
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-100 py-10 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-6 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-amber-400 flex items-center justify-center">
              <Clapperboard className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium text-gray-600">AI Video Factory</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/contact" className="hover:text-gray-700">Contact</Link>
          </div>
          <p>© {new Date().getFullYear()} AI Video Factory OS</p>
        </div>
      </footer>
    </div>
  );
}
