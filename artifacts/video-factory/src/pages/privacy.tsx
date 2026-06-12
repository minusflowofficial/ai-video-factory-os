import { MarketingLayout } from "@/components/MarketingLayout";

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-8">Privacy Policy</h1>
          <div className="prose prose-invert max-w-none text-zinc-400">
            <p>Last updated: October 1, 2023</p>
            <h2 className="text-white">1. Information We Collect</h2>
            <p>We collect information you provide directly to us, including your name, email address, payment information, and the content you upload or create using our service.</p>
            
            <h2 className="text-white">2. How We Use Your Information</h2>
            <p>We use the information we collect to provide, maintain, and improve our services, to process your transactions, and to communicate with you.</p>
            
            <h2 className="text-white">3. AI Data Processing</h2>
            <p>Your inputs (prompts, scripts) may be processed by third-party AI providers (OpenAI, Google, Anthropic) to generate your videos. We do not use your personal data to train our own models without explicit consent.</p>
            
            <h2 className="text-white">4. Data Security</h2>
            <p>We implement appropriate technical and organizational security measures to protect your data against unauthorized access, modification, or destruction.</p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
