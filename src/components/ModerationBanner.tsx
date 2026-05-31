import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

interface Flag {
  id: string;
  severity: string;
  category: string;
  reason: string;
  acknowledged: boolean;
  created_at: string;
}

export function ModerationBanner() {
  const { user } = useAuth();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [suspendedUntil, setSuspendedUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`mod-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "moderation_flags", filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("moderation_flags" as any) as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(5);
      setFlags((data ?? []) as Flag[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prof } = await (supabase.from("profiles") as any)
        .select("suspended_until")
        .eq("user_id", user!.id)
        .maybeSingle();
      const until = prof?.suspended_until as string | null | undefined;
      if (until && new Date(until) > new Date()) setSuspendedUntil(until);
      else setSuspendedUntil(null);
    }
  }, [user]);

  const ack = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("moderation_flags" as any) as any).update({ acknowledged: true }).eq("id", id);
    setFlags((f) => f.filter((x) => x.id !== id));
  };

  if (!user || (flags.length === 0 && !suspendedUntil)) return null;

  return (
    <div className="space-y-2 px-4 pt-2">
      {suspendedUntil && (
        <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Account temporarily suspended</p>
            <p className="text-xs">Until {new Date(suspendedUntil).toLocaleString()}. Messaging and posting are disabled.</p>
          </div>
        </div>
      )}
      {flags.map((f) => (
        <div
          key={f.id}
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p className="font-semibold capitalize">{f.severity} warning · {f.category.replace("_", " ")}</p>
            <p className="text-xs opacity-90">{f.reason}</p>
          </div>
          <button onClick={() => ack(f.id)} aria-label="Dismiss" className="rounded p-1 hover:bg-amber-500/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
