import { MarketingLayout } from "@/components/MarketingLayout";

export default function TermsPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-8">Terms of Service</h1>
          <div className="prose prose-invert max-w-none text-zinc-400">
            <p>Last updated: October 1, 2023</p>
            <h2 className="text-white">1. Acceptance of Terms</h2>
            <p>By accessing or using AI Video Factory OS, you agree to be bound by these Terms of Service.</p>
            
            <h2 className="text-white">2. Usage Rights</h2>
            <p>You retain all rights to the videos you generate using our platform, subject to the licensing terms of the underlying stock assets and AI models used in generation.</p>
            
            <h2 className="text-white">3. Acceptable Use</h2>
            <p>You agree not to use the platform to generate illegal, hateful, explicit, or copyright-infringing content.</p>
            
            <h2 className="text-white">4. Subscription and Billing</h2>
            <p>Subscriptions are billed in advance. You may cancel at any time, but we do not provide refunds for partial months.</p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
