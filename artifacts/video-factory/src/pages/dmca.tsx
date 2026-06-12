import { MarketingLayout } from "@/components/MarketingLayout";

export default function DmcaPage() {
  return (
    <MarketingLayout>
      <div className="pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-8">DMCA Policy</h1>
          <div className="prose prose-invert max-w-none text-zinc-400">
            <p>We respect the intellectual property rights of others. It is our policy to respond to any claim that Content posted on the Site infringes on the copyright or other intellectual property rights of any person or entity.</p>
            
            <h2 className="text-white">Filing a Complaint</h2>
            <p>If you believe in good faith that materials hosted by us infringe your copyright, please provide the written information requested below.</p>
            <ul>
              <li>A clear identification of the copyrighted work you claim was infringed.</li>
              <li>A clear identification of the material you claim is infringing the copyrighted work, and information that will allow us to locate that material on the Website.</li>
              <li>Your contact information so that we can reply to your complaint.</li>
              <li>A statement that you have a "good faith belief that the material that is claimed as copyright infringement is not authorized by the copyright owner, its agent, or the law."</li>
            </ul>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
