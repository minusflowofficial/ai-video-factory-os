import { MarketingLayout } from "@/components/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">Contact Us</h1>
            <p className="text-zinc-400">Have questions about Enterprise pricing or need technical support?</p>
          </div>

          <div className="glass-panel p-8 rounded-2xl border border-white/10">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Name</label>
                <Input placeholder="John Doe" className="bg-black/50 border-white/10" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Email</label>
                <Input type="email" placeholder="john@example.com" className="bg-black/50 border-white/10" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Message</label>
                <Textarea placeholder="How can we help you?" className="min-h-[150px] bg-black/50 border-white/10" />
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white h-12 text-lg rounded-xl">
                Send Message
              </Button>
            </form>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
