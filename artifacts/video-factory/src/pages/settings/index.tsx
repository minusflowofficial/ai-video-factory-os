import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Settings2, Key, Database, Sliders, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState({
    geminiKey: "",
    openaiKey: "",
    claudeKey: "",
    groqKey: "",
    pexelsKey: "",
    pixabayKey: "",
    unsplashKey: "",
    defaultAiProvider: "gemini",
    defaultDuration: "60s",
    defaultAspectRatio: "9:16",
    storageProvider: "supabase"
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (settings && !initRef.current) {
      setFormData({
        ...formData,
        defaultAiProvider: settings.defaultAiProvider || "gemini",
        defaultDuration: settings.defaultDuration || "60s",
        defaultAspectRatio: settings.defaultAspectRatio || "9:16",
        storageProvider: settings.storageProvider || "supabase"
      });
      initRef.current = true;
    }
  }, [settings]);

  const handleSave = () => {
    // Only send fields that actually have values (don't overwrite with empty strings if they are currently set)
    const updateData: any = {};
    if (formData.geminiKey) updateData.geminiKey = formData.geminiKey;
    if (formData.openaiKey) updateData.openaiKey = formData.openaiKey;
    if (formData.claudeKey) updateData.claudeKey = formData.claudeKey;
    if (formData.groqKey) updateData.groqKey = formData.groqKey;
    if (formData.pexelsKey) updateData.pexelsKey = formData.pexelsKey;
    
    updateData.defaultAiProvider = formData.defaultAiProvider;
    updateData.defaultDuration = formData.defaultDuration;
    updateData.defaultAspectRatio = formData.defaultAspectRatio;
    updateData.storageProvider = formData.storageProvider;

    updateSettings.mutate({ data: updateData }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetSettingsQueryKey(), updated);
        toast("Settings saved successfully", {
          icon: <CheckCircle2 className="text-emerald-500 w-4 h-4" />
        });
        // Clear sensitive inputs after save
        setFormData(prev => ({
          ...prev,
          geminiKey: "", openaiKey: "", claudeKey: "", groqKey: "", pexelsKey: ""
        }));
      }
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-white mb-2">Workspace Settings</h1>
            <p className="text-zinc-400">Configure your API keys, integrations, and default preferences.</p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={updateSettings.isPending}
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        <div className="space-y-8">
          {/* AI Providers */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5">
            <h2 className="text-xl font-heading font-semibold text-white mb-6 flex items-center gap-2">
              <Key className="w-5 h-5 text-violet-400" /> AI Provider Keys
            </h2>
            
            <div className="space-y-6">
              {[
                { id: 'openaiKey', label: 'OpenAI API Key', isSet: settings?.openaiKeySet, desc: 'Used for advanced scripting and refinement.' },
                { id: 'claudeKey', label: 'Anthropic Claude Key', isSet: settings?.claudeKeySet, desc: 'Used for creative ideation and structure.' },
                { id: 'geminiKey', label: 'Google Gemini Key', isSet: settings?.geminiKeySet, desc: 'Used for fast, cost-effective initial drafts.' },
                { id: 'groqKey', label: 'Groq API Key', isSet: settings?.groqKeySet, desc: 'Used for ultra-fast Llama inference.' },
              ].map((provider) => (
                <div key={provider.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-4">
                    <label className="text-sm font-medium text-white block mb-1">{provider.label}</label>
                    <p className="text-xs text-zinc-500">{provider.desc}</p>
                  </div>
                  <div className="md:col-span-8 relative">
                    <Input 
                      type="password"
                      placeholder={provider.isSet ? "•••••••••••••••••••• (Configured)" : "Enter API Key"}
                      value={formData[provider.id as keyof typeof formData] as string}
                      onChange={(e) => setFormData({...formData, [provider.id]: e.target.value})}
                      className="bg-black/50 border-white/10 text-white pr-10"
                    />
                    {provider.isSet && (
                      <div className="absolute right-3 top-2.5 text-emerald-500" title="Key is configured">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Asset Sources */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5">
            <h2 className="text-xl font-heading font-semibold text-white mb-6 flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" /> Asset & Media Sources
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start mb-6">
              <div className="md:col-span-4">
                <label className="text-sm font-medium text-white block mb-1">Pexels API Key</label>
                <p className="text-xs text-zinc-500">For premium B-roll footage.</p>
              </div>
              <div className="md:col-span-8 relative">
                <Input 
                  type="password"
                  placeholder={settings?.pexelsKeySet ? "•••••••••••••••••••• (Configured)" : "Enter Pexels API Key"}
                  value={formData.pexelsKey}
                  onChange={(e) => setFormData({...formData, pexelsKey: e.target.value})}
                  className="bg-black/50 border-white/10 text-white"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-4">
                <label className="text-sm font-medium text-white block mb-1">Storage Provider</label>
                <p className="text-xs text-zinc-500">Where rendered videos are saved.</p>
              </div>
              <div className="md:col-span-8">
                <Select value={formData.storageProvider} onValueChange={(v) => setFormData({...formData, storageProvider: v})}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-white/10">
                    <SelectItem value="supabase">Supabase Storage</SelectItem>
                    <SelectItem value="s3">AWS S3</SelectItem>
                    <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Defaults */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5">
            <h2 className="text-xl font-heading font-semibold text-white mb-6 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-400" /> Project Defaults
            </h2>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Default AI Router</label>
                <Select value={formData.defaultAiProvider} onValueChange={(v) => setFormData({...formData, defaultAiProvider: v})}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-white/10">
                    <SelectItem value="gemini">Gemini Fast</SelectItem>
                    <SelectItem value="claude">Claude Precision</SelectItem>
                    <SelectItem value="openai">GPT-4 Logic</SelectItem>
                    <SelectItem value="ensemble">Ensemble Chain (Best)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Default Duration</label>
                <Select value={formData.defaultDuration} onValueChange={(v) => setFormData({...formData, defaultDuration: v})}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-white/10">
                    <SelectItem value="30s">30 Seconds</SelectItem>
                    <SelectItem value="60s">60 Seconds</SelectItem>
                    <SelectItem value="90s">90 Seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Default Format</label>
                <Select value={formData.defaultAspectRatio} onValueChange={(v) => setFormData({...formData, defaultAspectRatio: v})}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-white/10">
                    <SelectItem value="9:16">9:16 (Shorts/Reels)</SelectItem>
                    <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
