import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import FeaturesPage from "@/pages/features";
import PricingPage from "@/pages/pricing";
import AboutPage from "@/pages/about";
import ContactPage from "@/pages/contact";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import DisclaimerPage from "@/pages/disclaimer";
import DmcaPage from "@/pages/dmca";

import StudioDashboard from "@/pages/studio/index";
import StudioNew from "@/pages/studio/new";
import StudioEditor from "@/pages/studio/[id]";
import BulkFactory from "@/pages/bulk/index";
import ProjectsHistory from "@/pages/projects/index";
import SettingsPage from "@/pages/settings/index";
import ClipperPage from "@/pages/clipper/index";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Marketing Pages */}
      <Route path="/" component={LandingPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/disclaimer" component={DisclaimerPage} />
      <Route path="/dmca" component={DmcaPage} />

      {/* App Pages */}
      <Route path="/studio" component={StudioDashboard} />
      <Route path="/studio/new" component={StudioNew} />
      <Route path="/studio/:id" component={StudioEditor} />
      <Route path="/bulk" component={BulkFactory} />
      <Route path="/projects" component={ProjectsHistory} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/clipper" component={ClipperPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
