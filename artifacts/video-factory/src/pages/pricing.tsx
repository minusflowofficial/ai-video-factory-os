import { MarketingLayout } from "@/components/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function PricingPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h1 className="text-4xl md:text-6xl font-heading font-bold mb-6">Simple, transparent pricing</h1>
            <p className="text-xl text-zinc-400">Everything you need to automate your video production. No hidden fees.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <div className="glass-panel rounded-3xl p-8 border border-white/10 flex flex-col">
              <div className="mb-8">
                <h3 className="text-2xl font-heading font-bold mb-2">Starter</h3>
                <p className="text-zinc-400 h-12">Perfect for creators testing the waters.</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-bold font-heading">$0</span>
                  <span className="text-zinc-500">/mo</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1 text-sm text-zinc-300">
                <li className="flex gap-3">✓ <span>5 videos per month</span></li>
                <li className="flex gap-3">✓ <span>Watermarked exports</span></li>
                <li className="flex gap-3">✓ <span>720p resolution</span></li>
                <li className="flex gap-3">✓ <span>Standard AI voices</span></li>
                <li className="flex gap-3 text-zinc-600">✗ <span>Custom fonts</span></li>
              </ul>
              <Link href="/studio">
                <Button variant="outline" className="w-full rounded-xl h-12 border-white/20 hover:bg-white/10">Get Started</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="glass-panel rounded-3xl p-8 border-primary/50 relative flex flex-col bg-primary/5">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Most Popular
              </div>
              <div className="mb-8">
                <h3 className="text-2xl font-heading font-bold mb-2 text-white">Pro</h3>
                <p className="text-zinc-400 h-12">For serious creators scaling their channels.</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-bold font-heading text-white">$29</span>
                  <span className="text-zinc-500">/mo</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1 text-sm text-zinc-200">
                <li className="flex gap-3">✓ <span>100 videos per month</span></li>
                <li className="flex gap-3">✓ <span>No watermarks</span></li>
                <li className="flex gap-3">✓ <span>4K resolution rendering</span></li>
                <li className="flex gap-3">✓ <span>Ultra-realistic premium voices</span></li>
                <li className="flex gap-3">✓ <span>All caption styles</span></li>
                <li className="flex gap-3">✓ <span>Commercial rights</span></li>
              </ul>
              <Link href="/studio">
                <Button className="w-full rounded-xl h-12 bg-primary hover:bg-primary/90 text-white">Subscribe to Pro</Button>
              </Link>
            </div>

            {/* Enterprise */}
            <div className="glass-panel rounded-3xl p-8 border border-white/10 flex flex-col">
              <div className="mb-8">
                <h3 className="text-2xl font-heading font-bold mb-2">Enterprise</h3>
                <p className="text-zinc-400 h-12">For agencies and media companies.</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-bold font-heading">$99</span>
                  <span className="text-zinc-500">/mo</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1 text-sm text-zinc-300">
                <li className="flex gap-3">✓ <span>Unlimited videos</span></li>
                <li className="flex gap-3">✓ <span>Bulk rendering API</span></li>
                <li className="flex gap-3">✓ <span>Custom branding & fonts</span></li>
                <li className="flex gap-3">✓ <span>Bring your own API keys</span></li>
                <li className="flex gap-3">✓ <span>Priority 24/7 support</span></li>
                <li className="flex gap-3">✓ <span>Team workspaces (up to 10)</span></li>
              </ul>
              <Link href="/contact">
                <Button variant="outline" className="w-full rounded-xl h-12 border-white/20 hover:bg-white/10">Contact Sales</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
