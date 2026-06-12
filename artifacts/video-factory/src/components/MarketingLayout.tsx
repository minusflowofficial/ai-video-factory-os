import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f] selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[#0a0a0f]/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl tracking-tight">AI Video Factory</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-white",
                  location === item.href ? "text-white" : "text-zinc-400"
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          
          <div className="flex items-center gap-4">
            <Link href="/studio" className="hidden sm:inline-flex text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              Log in
            </Link>
            <Link href="/studio">
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <footer className="bg-black/50 border-t border-white/5 pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-600 to-cyan-400 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="font-heading font-bold text-lg tracking-tight">AI Video Factory</span>
              </div>
              <p className="text-sm text-zinc-400 max-w-xs">
                The cinematic AI video production studio for forward-thinking creators and enterprise teams.
              </p>
            </div>
            
            <div>
              <h3 className="font-heading font-semibold mb-4 text-white">Product</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><Link href="/features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/studio" className="hover:text-white transition-colors">Studio</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-heading font-semibold mb-4 text-white">Company</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-heading font-semibold mb-4 text-white">Legal</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link></li>
                <li><Link href="/dmca" className="hover:text-white transition-colors">DMCA</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-zinc-500">
            <p>© {new Date().getFullYear()} AI Video Factory OS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
