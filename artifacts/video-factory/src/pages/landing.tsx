import { MarketingLayout } from "@/components/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clapperboard, Video, Settings, Layout, Zap, ArrowRight, Play, CheckCircle2 } from "lucide-react";
import heroStudioImage from "@/assets/images/hero-studio.png";

export default function LandingPage() {
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  const stagger = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  return (
    <MarketingLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/15 via-[#080b10] to-[#080b10] -z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] bg-amber-500/10 blur-[120px] rounded-full -z-10" />
        
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="max-w-4xl mx-auto space-y-8"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-zinc-300">
              <Clapperboard className="w-4 h-4 text-amber-400" />
              <span>The cinematic AI production studio</span>
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-heading font-bold tracking-tight leading-tight">
              Create cinematic videos at{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent glow-text">
                machine speed
              </span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              The professional OS for automated video creation. Combine Gemini, OpenAI, and Claude to generate scripts, source premium B-roll, and render perfect videos in minutes.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/studio">
                <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-primary-foreground rounded-full group w-full sm:w-auto font-semibold shadow-xl shadow-amber-500/20">
                  Start creating for free
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full border-white/10 hover:bg-white/5 w-full sm:w-auto">
                <Play className="w-5 h-5 ml-2 mr-2" fill="currentColor" />
                Watch Demo
              </Button>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-20 relative mx-auto max-w-5xl"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#080b10] via-transparent to-transparent z-10" />
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl p-2 bg-black/40">
              <img 
                src={heroStudioImage} 
                alt="AI Video Factory Studio Interface" 
                className="w-full h-auto rounded-xl border border-white/5 opacity-90"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?q=80&w=2000&auto=format&fit=crop";
                }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats/Logo Cloud */}
      <section className="py-12 border-y border-white/5 bg-black/20">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm font-medium text-zinc-500 mb-8 uppercase tracking-widest">Powered by industry-leading AI models</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {["OpenAI", "Anthropic", "Google Gemini", "Groq", "ElevenLabs", "Mixkit"].map((logo) => (
              <div key={logo} className="text-xl md:text-2xl font-heading font-bold text-white tracking-tight flex items-center">
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section className="py-24 md:py-32 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">A complete production studio in your browser</h2>
            <p className="text-zinc-400 text-lg">Stop juggling multiple tabs and subscriptions. We've combined the entire video creation pipeline into one seamless, powerful interface.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Multi-Model AI Brain",
                description: "Route your prompts through Gemini for ideation, Claude for scripting, and OpenAI for refinement. Build custom AI chains."
              },
              {
                icon: Video,
                title: "Cinematic B-Roll",
                description: "Automatically match script context to premium 4K stock footage and Mixkit library. Semantic search finds exactly what you mean."
              },
              {
                icon: Layout,
                title: "Dynamic Layouts",
                description: "Export instantly to 9:16 Shorts, 16:9 YouTube, or 1:1 Social formats. Intelligent auto-framing keeps subjects centered."
              }
            ].map((feature, i) => (
              <div key={i} className="glass-panel p-8 rounded-2xl border border-white/8 hover:border-primary/40 transition-colors group">
                <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-black/40 border-y border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">From idea to viral video in 3 steps</h2>
          </div>

          <div className="max-w-5xl mx-auto relative">
            <div className="absolute left-8 top-8 bottom-8 w-px bg-white/10 hidden md:block" />
            
            <div className="space-y-16">
              {[
                {
                  step: "01",
                  title: "Define your vision",
                  desc: "Enter a topic, niche, and select your visual style. Our AI orchestrator takes over, generating a compelling script optimized for retention.",
                  color: "from-amber-500 to-orange-500"
                },
                {
                  step: "02",
                  title: "Review and refine",
                  desc: "The Studio generates scenes, sources B-roll from Mixkit, and creates ultra-realistic voiceovers. Tweak anything in our powerful editor.",
                  color: "from-sky-500 to-blue-500"
                },
                {
                  step: "03",
                  title: "Render and conquer",
                  desc: "Export in 4K resolution across multiple aspect ratios simultaneously. Push directly to YouTube, TikTok, or download the assets.",
                  color: "from-emerald-500 to-teal-500"
                }
              ].map((item, i) => (
                <div key={i} className="relative flex flex-col md:flex-row gap-8 items-start">
                  <div className={`w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-2xl font-bold font-heading shadow-lg z-10`}>
                    {item.step}
                  </div>
                  <div className="glass-panel flex-1 p-8 rounded-2xl border border-white/8">
                    <h3 className="text-2xl font-heading font-bold mb-4">{item.title}</h3>
                    <p className="text-zinc-400 text-lg leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-amber-500/8 blur-[100px] rounded-full max-w-3xl mx-auto -z-10" />
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-6xl font-heading font-bold mb-8">Ready to scale your production?</h2>
          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">Join the creators and teams using AI Video Factory to produce months of content in a single afternoon.</p>
          <Link href="/studio">
            <Button size="lg" className="h-16 px-10 text-lg bg-white text-black hover:bg-zinc-200 rounded-full font-semibold">
              Launch Studio Workspace
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
