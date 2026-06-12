import { MarketingLayout } from "@/components/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Play, Zap, Film, Music2, Layers } from "lucide-react";

export default function LandingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs font-medium text-gray-600 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Now with Mixkit asset library
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
          The AI OS for<br />
          <span className="text-amber-500">Video Creation</span>
        </h1>

        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
          Generate scripts, source B-roll, create voiceovers, and render
          finished videos — all with a single click.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <Link href="/studio">
            <Button className="h-10 px-6 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-sm">
              Start creating — free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Button variant="outline" className="h-10 px-6 text-sm border-gray-200 text-gray-600 hover:bg-gray-50">
            <Play className="w-3.5 h-3.5 mr-2" fill="currentColor" />
            Watch demo
          </Button>
        </div>

        {/* App screenshot placeholder */}
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white max-w-4xl mx-auto">
          <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 px-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-400 font-mono">app.aivideofactory.com/studio</span>
            <span className="ml-auto text-xs font-medium text-emerald-600">● LIVE</span>
          </div>
          <img
            src="https://images.unsplash.com/photo-1611532736597-de2d4265fba3?q=80&w=1600&auto=format&fit=crop"
            alt="Studio Interface"
            className="w-full h-auto object-cover opacity-90"
            style={{ maxHeight: 320 }}
          />
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-gray-100 py-8 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-6">Powered by</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
            {["OpenAI", "Anthropic Claude", "Google Gemini", "Groq", "ElevenLabs", "Mixkit"].map((name) => (
              <span key={name} className="text-sm font-semibold text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything in one place</h2>
          <p className="text-gray-500 max-w-xl mx-auto">No more switching between tools. Script, source, voice, and render in a single workflow.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap,    title: "One-click generation",  desc: "Hit Generate and watch your entire pipeline run automatically — script, B-roll, voice, render." },
            { icon: Film,   title: "Mixkit B-roll library", desc: "Thousands of free cinematic clips automatically matched to your script context." },
            { icon: Music2, title: "Background music",      desc: "Choose from curated Mixkit tracks. Preview and select before rendering." },
            { icon: Layers, title: "Multi-format export",   desc: "9:16 Shorts, 16:9 YouTube, 1:1 Square — all from the same project." },
            { icon: Zap,    title: "Bulk Factory",          desc: "Queue 10–500 videos at once. Ideal for faceless channels and content agencies." },
            { icon: Film,   title: "AI model routing",      desc: "Route prompts through Gemini, Claude, or OpenAI. Chain models for best output." },
          ].map((f, i) => (
            <div key={i} className="p-5 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-4">
                <f.icon className="w-4 h-4 text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{f.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to ship content at scale?</h2>
          <p className="text-gray-400 mb-8 text-sm">Join creators producing weeks of video content in minutes.</p>
          <Link href="/studio">
            <Button className="h-10 px-8 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold">
              Launch Studio — it's free
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
