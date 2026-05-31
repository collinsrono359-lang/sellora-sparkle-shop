import { Link } from "@tanstack/react-router";
import { Home, PlusCircle, MessageSquare, LayoutGrid, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const items = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/saved", label: "Saved", Icon: Heart },
  { to: "/sell", label: "Sell", Icon: PlusCircle },
  { to: "/inbox", label: "Inbox", Icon: MessageSquare, badge: "messages" as const },
  { to: "/dashboard", label: "Dashboard", Icon: LayoutGrid },
] as const;

function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("read", false);
      if (!cancelled) setCount(c ?? 0);
    };
    void load();
    const channel = supabase
      .channel(`nav-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [user]);

  return count;
}

export function BottomNav() {
  const unread = useUnreadMessages();
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-40 border-t border-border bg-card"
    >
      <ul className="mx-auto flex max-w-screen-md items-center justify-around">
        {items.map(({ to, label, Icon, ...rest }) => {
          const showBadge = "badge" in rest && rest.badge === "messages" && unread > 0;
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-12 min-w-12 flex-col items-center justify-center px-3 py-2 text-xs text-muted-foreground"
                activeProps={{ className: "flex min-h-12 min-w-12 flex-col items-center justify-center px-3 py-2 text-xs text-primary font-semibold" }}
                activeOptions={{ exact: to === "/" }}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden />
                  {showBadge && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className="mt-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
