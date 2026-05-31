import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { GuestGate } from "@/components/GuestGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Sellora" }] }),
  component: Inbox,
});

interface Thread {
  other_id: string;
  other_name: string | null;
  other_avatar: string | null;
  product_id: string | null;
  product_title: string | null;
  product_photo: string | null;
  last_body: string;
  last_at: string;
  unread: number;
}

function Inbox() {
  const { user, loading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingThreads(true);

      // Load my per-peer chat clears so the inbox respects them too.
      const { data: clears } = await supabase
        .from("chat_clears")
        .select("peer_id,cleared_at")
        .eq("user_id", user.id);
      const clearMap = new Map<string, string>(
        ((clears as { peer_id: string; cleared_at: string }[]) ?? []).map((c) => [c.peer_id, c.cleared_at])
      );

      const { data: msgs } = await supabase
        .from("messages")
        .select("id,sender_id,recipient_id,product_id,body,read,created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!msgs) {
        setThreads([]);
        setLoadingThreads(false);
        return;
      }

      const map = new Map<string, Thread>();
      const otherIds = new Set<string>();
      const productIds = new Set<string>();

      for (const m of msgs) {
        const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        // Skip messages older than my "cleared" timestamp for this peer.
        const clearedAt = clearMap.get(other);
        if (clearedAt && new Date(m.created_at) <= new Date(clearedAt)) continue;
        const key = `${other}:${m.product_id ?? "none"}`;
        otherIds.add(other);
        if (m.product_id) productIds.add(m.product_id);
        if (!map.has(key)) {
          map.set(key, {
            other_id: other,
            other_name: null,
            other_avatar: null,
            product_id: m.product_id,
            product_title: null,
            product_photo: null,
            last_body: m.body,
            last_at: m.created_at,
            unread: 0,
          });
        }
        const t = map.get(key)!;
        if (m.recipient_id === user.id && !m.read) t.unread += 1;
      }

      const [{ data: profs }, { data: prods }] = await Promise.all([
        otherIds.size
          ? supabase.from("profiles").select("user_id,display_name,avatar_url").in("user_id", Array.from(otherIds))
          : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }> }),
        productIds.size
          ? supabase.from("products").select("id,title,photos").in("id", Array.from(productIds))
          : Promise.resolve({ data: [] as Array<{ id: string; title: string; photos: string[] }> }),
      ]);

      const profMap = new Map((profs ?? []).map((p) => [p.user_id, p]));
      const prodMap = new Map((prods ?? []).map((p) => [p.id, p]));

      const list = Array.from(map.values())
        .map((t) => {
          const prof = profMap.get(t.other_id);
          const prod = t.product_id ? prodMap.get(t.product_id) : null;
          return {
            ...t,
            other_name: prof?.display_name ?? null,
            other_avatar: prof?.avatar_url ?? null,
            product_title: prod?.title ?? null,
            product_photo: prod?.photos?.[0] ?? null,
          };
        })
        .sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at));

      setThreads(list);
      setLoadingThreads(false);
    })();
  }, [user]);

  if (loading) return <AppLayout><p className="text-sm text-muted-foreground">Loading…</p></AppLayout>;
  if (!user) return <AppLayout><GuestGate message="Sign in to message buyers and sellers." /></AppLayout>;

  return (
    <AppLayout>
      <h1 className="mb-3 text-xl font-bold">Inbox</h1>
      {loadingThreads ? (
        <p className="text-sm text-muted-foreground">Loading conversations…</p>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-10 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No messages yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When buyers message you about a product, conversations appear here.
          </p>
          <Link
            to="/search"
            search={{ q: "" }}
            className="mt-4 rounded-md bg-[image:var(--gradient-primary)] px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Browse products
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: open any product and tap <strong>Message Seller</strong> to start a chat.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {threads.map((t) => {
            const initial = (t.other_name || "U").charAt(0).toUpperCase();
            return (
              <li key={`${t.other_id}:${t.product_id ?? "none"}`}>
                <Link
                  to="/inbox/$userId"
                  params={{ userId: t.other_id }}
                  search={{ product: t.product_id ?? undefined }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50"
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={t.other_avatar ?? undefined} alt="" className="h-12 w-12 rounded-full object-cover" />
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 font-semibold">{t.other_name ?? "User"}</p>
                      <span className="text-[10px] text-muted-foreground">{new Date(t.last_at).toLocaleDateString()}</span>
                    </div>
                    {t.product_title && (
                      <p className="line-clamp-1 text-xs text-primary">📦 {t.product_title}</p>
                    )}
                    <p className="line-clamp-1 text-sm text-muted-foreground">{t.last_body}</p>
                  </div>
                  {t.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {t.unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppLayout>
  );
}
