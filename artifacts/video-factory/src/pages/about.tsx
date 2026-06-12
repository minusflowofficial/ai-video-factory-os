import { MarketingLayout } from "@/components/MarketingLayout";

export default function AboutPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-heading font-bold mb-8">About Us</h1>
          
          <div className="prose prose-invert prose-lg max-w-none">
            <p className="lead text-xl text-zinc-300 mb-8">
              We are a team of filmmakers and engineers building the future of automated video production.
            </p>
            
            <h2 className="text-2xl font-heading font-semibold mt-12 mb-4">Our Mission</h2>
            <p className="text-zinc-400 mb-6">
              Video is the most powerful medium for communication, but production is slow, expensive, and technically demanding. Our mission is to democratize cinematic video production by combining the best AI models into a single, cohesive workflow.
            </p>
            
            <h2 className="text-2xl font-heading font-semibold mt-12 mb-4">The OS for Creators</h2>
            <p className="text-zinc-400 mb-6">
              We're not building just another AI toy. We're building professional infrastructure. AI Video Factory OS is designed for agencies, media companies, and serious creators who need reliable, scalable output without sacrificing quality.
            </p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
