import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Subscribes to new notifications for the current user and triggers a
// browser notification if permission has been granted. Also exposes nothing —
// it's purely a side-effect hook mounted at the root.
export function useNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    // Ask for permission once per session.
    if (Notification.permission === "default") {
      try { void Notification.requestPermission(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as { title: string; body: string | null; link: string | null };
          if (!("Notification" in window) || Notification.permission !== "granted") return;
          if (document.visibilityState === "visible") return; // skip if user is here
          try {
            const note = new Notification(n.title || "Sellora", {
              body: n.body ?? "",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: n.link ?? undefined,
            });
            note.onclick = () => {
              window.focus();
              if (n.link) window.location.href = n.link;
            };
          } catch {
            /* ignore */
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
