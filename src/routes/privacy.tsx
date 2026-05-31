import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — Sellora" }] }),
  component: PrivacyPage,
});

interface Prefs {
  show_online: boolean;
  show_location: boolean;
  allow_messages: boolean;
  read_receipts: boolean;
}
const DEFAULTS: Prefs = { show_online: true, show_location: true, allow_messages: true, read_receipts: true };

function PrivacyPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load — local first, then DB
  useEffect(() => {
    const local = localStorage.getItem("privacy");
    if (local) { try { setPrefs({ ...DEFAULTS, ...JSON.parse(local) }); } catch { /* ignore */ } }
    if (!user) return;
    supabase.from("user_preferences").select("show_online,show_location,allow_messages,read_receipts").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({
        show_online: data.show_online,
        show_location: data.show_location,
        allow_messages: data.allow_messages,
        read_receipts: data.read_receipts,
      });
    });
  }, [user]);

  const save = async () => {
    setBusy(true);
    localStorage.setItem("privacy", JSON.stringify(prefs));
    if (user) {
      const { error } = await supabase.from("user_preferences").upsert(
        { user_id: user.id, ...prefs },
        { onConflict: "user_id" }
      );
      if (error) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
    }
    toast.success("Privacy preferences saved");
    setBusy(false);
  };

  const set = <K extends keyof Prefs>(k: K) => (v: boolean) => setPrefs((p) => ({ ...p, [k]: v }));

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Privacy Settings</h1>
      </div>

      <ul className="overflow-hidden rounded-lg border border-border bg-card">
        <Toggle label="Show online status" checked={prefs.show_online} onChange={set("show_online")} />
        <Toggle label="Show my location on profile" checked={prefs.show_location} onChange={set("show_location")} />
        <Toggle label="Allow direct messages" checked={prefs.allow_messages} onChange={set("allow_messages")} />
        <Toggle label="Send read receipts" checked={prefs.read_receipts} onChange={set("read_receipts")} />
      </ul>

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Save preferences
      </button>
    </AppLayout>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </li>
  );
}
