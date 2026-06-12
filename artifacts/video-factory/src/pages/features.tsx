import { MarketingLayout } from "@/components/MarketingLayout";
import { Sparkles, Video, Settings, Layout, Zap, Layers, Cpu, Globe } from "lucide-react";

export default function FeaturesPage() {
  const features = [
    {
      icon: Cpu,
      title: "Multi-Model AI Orchestration",
      description: "Our proprietary engine routes different tasks to the best AI models. Gemini for creative ideation, Claude 3.5 Sonnet for logical scripting, and GPT-4o for final polish and formatting."
    },
    {
      icon: Layers,
      title: "Semantic B-Roll Sourcing",
      description: "We don't just match keywords. Our engine understands the context of your scene and sources premium 4K stock footage from Pexels, Pixabay, and our internal library that perfectly matches the mood."
    },
    {
      icon: Layout,
      title: "Dynamic Aspect Ratios",
      description: "Build once, render everywhere. Our intelligent framing keeps the subject in focus whether you're rendering for 9:16 TikTok, 16:9 YouTube, or 1:1 Instagram."
    },
    {
      icon: Zap,
      title: "Bulk Job Queue",
      description: "Need 50 videos for a faceless channel? Enter your niche and parameters, and let the Bulk Factory run overnight. Wake up to a folder full of ready-to-publish content."
    },
    {
      icon: Video,
      title: "Node-Based Pipeline",
      description: "Every step is isolated. Generate the script, tweak it. Generate assets, replace what you don't like. Generate voice, adjust the pacing. Full control at every stage."
    },
    {
      icon: Globe,
      title: "Multi-Language Support",
      description: "Translate and dub your videos into 29+ languages instantly using ElevenLabs integration, perfectly synced with generated captions."
    }
  ];

  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h1 className="text-4xl md:text-6xl font-heading font-bold mb-6">Platform Features</h1>
            <p className="text-xl text-zinc-400">Everything you need to automate video production at scale.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {features.map((feature, i) => (
              <div key={i} className="glass-panel p-8 rounded-2xl border border-white/10 hover:border-primary/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-bold mb-3">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
