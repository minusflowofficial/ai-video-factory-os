import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Key, Save, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const initRef = useRef(false);

  const [form, setForm] = useState({
    geminiKey: "", openaiKey: "", claudeKey: "", groqKey: "", pexelsKey: "",
    defaultAiProvider: "gemini", defaultDuration: "60s", defaultAspectRatio: "9:16", storageProvider: "supabase"
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (settings && !initRef.current) {
      setForm(f => ({
        ...f,
        defaultAiProvider: settings.defaultAiProvider || "gemini",
        defaultDuration: settings.defaultDuration || "60s",
        defaultAspectRatio: settings.defaultAspectRatio || "9:16",
        storageProvider: settings.storageProvider || "supabase",
      }));
      initRef.current = true;
    }
  }, [settings]);

  const handleSave = () => {
    const data: any = {
      defaultAiProvider: form.defaultAiProvider,
      defaultDuration: form.defaultDuration,
      defaultAspectRatio: form.defaultAspectRatio,
      storageProvider: form.storageProvider,
    };
    if (form.geminiKey) data.geminiKey = form.geminiKey;
    if (form.openaiKey) data.openaiKey = form.openaiKey;
    if (form.claudeKey) data.claudeKey = form.claudeKey;
    if (form.groqKey)   data.groqKey   = form.groqKey;
    if (form.pexelsKey) data.pexelsKey = form.pexelsKey;

    updateSettings.mutate({ data }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetSettingsQueryKey(), updated);
        toast("Settings saved", { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> });
        setForm(f => ({ ...f, geminiKey: "", openaiKey: "", claudeKey: "", groqKey: "", pexelsKey: "" }));
      }
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center py-24">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const keys = [
    { id: "openaiKey",   label: "OpenAI API Key",       isSet: settings?.openaiKeySet,   desc: "GPT-4 for scripting and refinement" },
    { id: "claudeKey",   label: "Anthropic Claude Key",  isSet: settings?.claudeKeySet,   desc: "Creative ideation and structure" },
    { id: "geminiKey",   label: "Google Gemini Key",     isSet: settings?.geminiKeySet,   desc: "Fast, cost-effective drafts" },
    { id: "groqKey",     label: "Groq API Key",          isSet: settings?.groqKeySet,     desc: "Ultra-fast Llama inference" },
    { id: "pexelsKey",   label: "Pexels API Key",        isSet: settings?.pexelsKeySet,   desc: "Optional — extra B-roll footage" },
    { id: "pixabayKey",  label: "Pixabay API Key",       isSet: settings?.pixabayKeySet,  desc: "Free stock video & image search" },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">API keys and workspace defaults</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="h-8 px-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold text-xs"
          >
            {updateSettings.isPending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
              : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Changes</>
            }
          </Button>
        </div>

        <div className="space-y-5">
          {/* AI Keys */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Key className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-800">AI Provider Keys</h2>
            </div>
            <div className="p-5 space-y-4">
              {keys.map(k => (
                <div key={k.id} className="flex items-center gap-4">
                  <div className="w-44 shrink-0">
                    <p className="text-sm font-medium text-gray-800">{k.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{k.desc}</p>
                  </div>
                  <div className="flex-1 relative">
                    <Input
                      type="password"
                      placeholder={k.isSet ? "••••••••••••• (Configured)" : "Enter key"}
                      value={form[k.id as keyof typeof form] as string}
                      onChange={e => set(k.id, e.target.value)}
                      className="h-9 text-sm border-gray-200 bg-gray-50 pr-9"
                    />
                    {k.isSet && (
                      <CheckCircle2 className="absolute right-2.5 top-2.5 w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mixkit status */}
          <div className="bg-amber-50 rounded-xl border border-amber-100 px-5 py-4 flex gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">Mixkit CDN — Active (no key needed)</p>
              <p className="text-xs text-gray-500 mt-0.5">Free cinematic videos, music, and SFX automatically sourced from Mixkit's library.</p>
            </div>
          </div>

          {/* Defaults */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Project Defaults</h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-4">
              {[
                {
                  label: "AI Provider", key: "defaultAiProvider",
                  opts: [["gemini","Gemini Fast"],["claude","Claude Precision"],["openai","GPT-4 Logic"],["ensemble","Ensemble"]]
                },
                {
                  label: "Duration", key: "defaultDuration",
                  opts: [["30s","30 Seconds"],["60s","60 Seconds"],["90s","90 Seconds"],["3min","3 Minutes"]]
                },
                {
                  label: "Format", key: "defaultAspectRatio",
                  opts: [["9:16","9:16 Shorts"],["16:9","16:9 YouTube"],["1:1","1:1 Square"]]
                },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">{field.label}</label>
                  <Select value={form[field.key as keyof typeof form] as string} onValueChange={v => set(field.key, v)}>
                    <SelectTrigger className="h-9 text-sm border-gray-200 bg-gray-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
