// Client-side helpers to record activity events and run AI moderation via the server.
import { supabase } from "@/integrations/supabase/client";

let cachedIp: string | null = null;
let cachedFingerprint: string | null = null;

async function getIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    cachedIp = j.ip ?? null;
  } catch {
    cachedIp = null;
  }
  return cachedIp;
}

function getFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "ssr";
  const key = "sellora_device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    const seed = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}|${Math.random().toString(36).slice(2)}`;
    // simple hash
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    fp = `fp_${Math.abs(h).toString(36)}_${Date.now().toString(36)}`;
    localStorage.setItem(key, fp);
  }
  cachedFingerprint = fp;
  return fp;
}

export type ModerationEventType = "login" | "signup" | "message" | "post" | "view" | "logout";

export async function recordEvent(opts: {
  type: ModerationEventType;
  content?: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
}) {
  const ip = await getIp();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const userId = opts.userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("moderation_events" as any) as any).insert({
    user_id: userId,
    event_type: opts.type,
    content: opts.content ?? null,
    ip,
    user_agent: ua,
    metadata: opts.metadata ?? {},
  });

  if (userId) {
    const fp = getFingerprint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("device_fingerprints" as any) as any).upsert(
      { user_id: userId, fingerprint: fp, ip, user_agent: ua, last_seen: new Date().toISOString() },
      { onConflict: "user_id,fingerprint" }
    );
  }

  // Fire-and-forget moderation pass for content events
  if (userId && (opts.type === "message" || opts.type === "post" || opts.type === "login")) {
    void runModeration(userId).catch(() => {});
  }
}

async function runModeration(userId: string) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/_unused`, { method: "HEAD" }).catch(() => {});
    // Call our TanStack server function endpoint
    await fetch("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // ignore
  }
}

export async function isSuspended(userId: string): Promise<{ suspended: boolean; until?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from("profiles") as any)
    .select("suspended_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.suspended_until) return { suspended: false };
  const until = data.suspended_until as string;
  return { suspended: new Date(until) > new Date(), until };
}

