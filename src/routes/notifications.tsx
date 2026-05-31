import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Bell, MessageSquare, Package, Sparkles, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Sellora" }] }),
  component: Notifications,
});

interface Notif { id: string; category: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }

const TABS = [
  { key: "all", label: "All", Icon: Bell },
  { key: "messages", label: "Messages", Icon: MessageSquare },
  { key: "product", label: "Products", Icon: Package },
  { key: "account", label: "Account", Icon: User },
  { key: "promotions", label: "Promos", Icon: Sparkles },
] as const;

function Notifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!user) return;
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Notif[]) ?? []));
  }, [user, loading, navigate]);

  const filtered = tab === "all" ? items : items.filter((n) => n.category === tab);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
    setItems((p) => p.map((n) => ({ ...n, read: true })));
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        <button onClick={markAllRead} className="text-sm font-medium text-primary">Mark all read</button>
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">No notifications</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id} className={`rounded-lg border border-border p-3 ${n.read ? "bg-card" : "bg-primary-soft"}`}>
              <p className="font-semibold">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
            </li>
          ))}
        </ul>
      )}
    </AppLayout>
  );
}
