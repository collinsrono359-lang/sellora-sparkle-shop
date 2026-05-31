import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { GuestGate } from "@/components/GuestGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { recordEvent, isSuspended } from "@/lib/moderation-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Send,
  MapPin,
  MoreVertical,
  Bell,
  BellOff,
  Trash2,
  Flag,
  Check,
  CheckCheck,
  Clock,
  Store,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/inbox_/$userId")({
  validateSearch: (s: Record<string, unknown>) => ({
    product: typeof s.product === "string" ? s.product : undefined,
  }),
  head: () => ({ meta: [{ title: "Chat — Sellora" }] }),
  component: Chat,
});

interface Msg {
  id: string;
  sender_id: string;
  recipient_id: string;
  product_id: string | null;
  body: string;
  read: boolean;
  delivered_at: string | null;
  seen_at: string | null;
  kind: "text" | "location";
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  // local-only flag for optimistic queued messages
  _queued?: boolean;
}

function Chat() {
  const { userId } = Route.useParams();
  const { product } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [other, setOther] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [productInfo, setProductInfo] = useState<
    { id: string; title: string; price: number; currency: string; photos: string[] } | null
  >(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Load peer profile + (optional) product context
  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name,avatar_url")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setOther(data ?? null));
    if (product) {
      supabase
        .from("products")
        .select("id,title,price,currency,photos")
        .eq("id", product)
        .maybeSingle()
        .then(({ data }) => {
          setProductInfo(data ?? null);
          // Note: we no longer auto-fill the composer. The pinned product card
          // gives context; the user types their own first message.
        });
    }
  }, [userId, product]);

  // Load messages + realtime subscriptions
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      // Respect per-user "clear chat": only show messages newer than my cleared_at.
      const { data: clearRow } = await supabase
        .from("chat_clears")
        .select("cleared_at")
        .eq("user_id", user.id)
        .eq("peer_id", userId)
        .maybeSingle();
      const clearedAt = (clearRow as { cleared_at: string } | null)?.cleared_at;

      let q = supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true })
        .limit(500);
      if (clearedAt) q = q.gt("created_at", clearedAt);

      const { data } = await q;
      if (cancelled) return;
      const list = (data as Msg[]) ?? [];
      setMessages(list);

      // Mark anything from the peer as delivered + seen
      const toMark = list
        .filter((m) => m.recipient_id === user.id && (!m.seen_at || !m.delivered_at))
        .map((m) => m.id);
      if (toMark.length) {
        const now = new Date().toISOString();
        await supabase
          .from("messages")
          .update({ read: true, seen_at: now, delivered_at: now })
          .in("id", toMark);
      }
    };
    load();

    const messagesChannel = supabase
      .channel(`chat-msgs:${user.id}:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as Msg;
          const inThread =
            (m.sender_id === user.id && m.recipient_id === userId) ||
            (m.sender_id === userId && m.recipient_id === user.id);
          if (!inThread) return;

          setMessages((prev) => {
            // Replace optimistic queued messages with the real one (match by body+sender within 5s)
            const idx = prev.findIndex(
              (p) =>
                p._queued &&
                p.sender_id === m.sender_id &&
                p.body === m.body &&
                Math.abs(+new Date(p.created_at) - +new Date(m.created_at)) < 10000
            );
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = m;
              return next;
            }
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });

          if (m.recipient_id === user.id) {
            const now = new Date().toISOString();
            await supabase
              .from("messages")
              .update({ read: true, delivered_at: now, seen_at: now })
              .eq("id", m.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => prev.map((p) => (p.id === m.id ? { ...p, ...m } : p)));
        }
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`chat-typing:${userId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_status",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { peer_id: string; is_typing: boolean; updated_at: string } | null;
          if (!row || row.peer_id !== user.id) return;
          // Auto-expire typing after 6s of no updates
          const isTyping =
            row.is_typing && Date.now() - +new Date(row.updated_at) < 6000;
          setPeerTyping(isTyping);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [user, userId]);

  // Auto-scroll to bottom on new messages or typing
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, peerTyping]);

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (user) {
        supabase
          .from("typing_status")
          .upsert({ user_id: user.id, peer_id: userId, is_typing: false, updated_at: new Date().toISOString() })
          .then(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId]);

  const sendTyping = async (typing: boolean) => {
    if (!user) return;
    const now = Date.now();
    // throttle to once per 2s
    if (typing && now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    await supabase.from("typing_status").upsert({
      user_id: user.id,
      peer_id: userId,
      is_typing: typing,
      updated_at: new Date().toISOString(),
    });
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    if (!user) return;
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2500);
  };

  const send = async () => {
    if (!user) return;
    const text = body.trim();
    if (!text) {
      toast.error("Please type a message before sending.");
      return;
    }
    if (text.length > 2000) {
      toast.error("Message is too long (max 2000 characters).");
      return;
    }
    // Block links / URLs in messages to prevent off-platform scams & phishing.
    const linkRegex = /(https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|io|co|app|xyz|info|biz|me|ly|gg|to|tv|us|uk|ke|ng|za|in|store|shop|online|live|click|link|site)\b)/i;
    if (linkRegex.test(text)) {
      toast.error("Links aren't allowed in messages. Please share details directly here.");
      return;
    }
    if (sending) return;
    if (user.id === userId) {
      toast.info("You can't message yourself");
      return;
    }
    const susp = await isSuspended(user.id);
    if (susp.suspended) {
      toast.error(`Account suspended until ${new Date(susp.until!).toLocaleString()}`);
      return;
    }
    setSending(true);

    // Optimistic queued bubble
    const tempId = `tmp-${crypto.randomUUID()}`;
    const queued: Msg = {
      id: tempId,
      sender_id: user.id,
      recipient_id: userId,
      product_id: product || null,
      body: text,
      read: false,
      delivered_at: null,
      seen_at: null,
      kind: "text",
      latitude: null,
      longitude: null,
      created_at: new Date().toISOString(),
      _queued: true,
    };
    setMessages((prev) => [...prev, queued]);
    setBody("");
    sendTyping(false);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: userId,
        product_id: product || null,
        body: text,
        kind: "text",
      })
      .select("*")
      .single();

    setSending(false);

    if (error) {
      toast.error(error.message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setBody(text);
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as Msg) : m)));
      void recordEvent({ type: "message", content: text, userId: user.id, metadata: { recipient_id: userId, product_id: product || null } });
    }
  };

  const sendLocation = () => {
    if (!user) return;
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation isn't supported on this device.");
      return;
    }
    toast.loading("Getting your location…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss("geo");
        const { latitude, longitude } = pos.coords;
        const tempId = `tmp-${crypto.randomUUID()}`;
        const queued: Msg = {
          id: tempId,
          sender_id: user.id,
          recipient_id: userId,
          product_id: product || null,
          body: `📍 Location`,
          read: false,
          delivered_at: null,
          seen_at: null,
          kind: "location",
          latitude,
          longitude,
          created_at: new Date().toISOString(),
          _queued: true,
        };
        setMessages((prev) => [...prev, queued]);

        const { data, error } = await supabase
          .from("messages")
          .insert({
            sender_id: user.id,
            recipient_id: userId,
            product_id: product || null,
            body: "📍 Location",
            kind: "location",
            latitude,
            longitude,
          })
          .select("*")
          .single();

        if (error) {
          toast.error(error.message);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }
        if (data) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as Msg) : m)));
        }
      },
      (err) => {
        toast.dismiss("geo");
        toast.error(err.message || "Couldn't access location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clearChat = async () => {
    if (!user) return;
    if (!confirm("Clear this conversation? Only your view is affected.")) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("chat_clears")
      .upsert(
        { user_id: user.id, peer_id: userId, cleared_at: now },
        { onConflict: "user_id,peer_id" }
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    setMessages([]);
    toast.success("Chat cleared from your view.");
  };

  const initial = (other?.display_name || "U").charAt(0).toUpperCase();

  // Group messages by day
  const grouped = useMemo(() => {
    const groups: { day: string; items: Msg[] }[] = [];
    for (const m of messages) {
      const d = new Date(m.created_at);
      const key = d.toDateString();
      const last = groups[groups.length - 1];
      if (!last || last.day !== key) groups.push({ day: key, items: [m] });
      else last.items.push(m);
    }
    return groups;
  }, [messages]);

  const dayLabel = (day: string) => {
    const d = new Date(day);
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  };

  if (loading)
    return (
      <AppLayout>
        <p>Loading…</p>
      </AppLayout>
    );
  if (!user)
    return (
      <AppLayout>
        <GuestGate message="Sign in to chat" />
      </AppLayout>
    );

  return (
    <AppLayout>
      {/* Sticky chat header */}
      <div className="-mx-4 -mt-4 sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <button
          onClick={() => navigate({ to: "/inbox" })}
          aria-label="Back"
          className="rounded-full p-2 hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link to="/shop/$id" params={{ id: userId }} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage
              src={other?.avatar_url ?? undefined}
              className="h-9 w-9 rounded-full object-cover"
            />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-semibold">{other?.display_name ?? "User"}</p>
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {peerTyping ? <span className="text-primary">typing…</span> : "Tap to view shop"}
            </p>
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Chat settings" className="rounded-full p-2 hover:bg-secondary">
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Chat settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMuted((m) => !m)}>
              {muted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
              {muted ? "Unmute notifications" : "Mute notifications"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/shop/$id" params={{ id: userId }}>
                <Store className="mr-2 h-4 w-4" />
                View seller shop
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/report" search={{ user: userId }}>
                <Flag className="mr-2 h-4 w-4" />
                Report user
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clearChat} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pinned product context — visible only, never auto-sent. Tap "Ask about this" to prefill the composer. */}
      {productInfo && (
        <div className="-mx-4 sticky top-[57px] z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Link
            to="/product/$id"
            params={{ id: productInfo.id }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
              {productInfo.photos[0] && (
                <img src={productInfo.photos[0]} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{productInfo.title}</p>
              <p className="text-xs font-bold text-primary">
                {productInfo.currency} {productInfo.price.toLocaleString()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setBody(`Hi! Is "${productInfo.title}" still available?`)}
            className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
          >
            Ask about this
          </button>
        </div>
      )}

      {/* Messages — taller scroll area, closer to input */}
      <div
        ref={scrollRef}
        className="-mx-4 flex flex-col gap-1 overflow-y-auto bg-secondary/30 px-4 py-3"
        style={{ height: "calc(100dvh - 220px)" }}
      >
        {grouped.length === 0 && !peerTyping ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Say hi 👋</p>
        ) : (
          grouped.map((g) => (
            <div key={g.day} className="flex flex-col gap-1">
              <div className="mx-auto my-2 rounded-full bg-card px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                {dayLabel(g.day)}
              </div>
              {g.items.map((m) => {
                const mine = m.sender_id === user.id;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? "ml-auto rounded-br-sm bg-primary text-primary-foreground"
                        : "mr-auto rounded-bl-sm bg-card"
                    }`}
                  >
                    {m.kind === "location" && m.latitude != null && m.longitude != null ? (
                      (() => {
                        const lat = m.latitude;
                        const lng = m.longitude;
                        const d = 0.01;
                        const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
                        const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
                        const open = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
                        return (
                          <div className="space-y-1">
                            <div className="overflow-hidden rounded-lg border border-border/40 bg-muted">
                              <iframe
                                title="Shared location map"
                                src={embed}
                                className="block h-40 w-[260px] max-w-full"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                            </div>
                            <a
                              href={open}
                              target="_blank"
                              rel="noreferrer noopener"
                              className={`flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline ${
                                mine ? "text-primary-foreground" : "text-primary"
                              }`}
                            >
                              <MapPin className="h-3.5 w-3.5" /> Open in maps
                            </a>
                            <p
                              className={`text-[10px] ${
                                mine ? "text-primary-foreground/70" : "text-muted-foreground"
                              }`}
                            >
                              {lat.toFixed(5)}, {lng.toFixed(5)}
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="whitespace-pre-line break-words">{m.body}</p>
                    )}
                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
                        mine ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      <span>
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {mine && (
                        <span aria-label="status" title={statusLabel(m)}>
                          {m._queued ? (
                            <Clock className="h-3 w-3" />
                          ) : m.seen_at ? (
                            <CheckCheck className="h-3 w-3 text-sky-300" />
                          ) : m.delivered_at ? (
                            <CheckCheck className="h-3 w-3" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {peerTyping && (
          <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-sm bg-card px-3 py-2 shadow-sm">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        )}
      </div>

      {/* Composer — anchored just above bottom nav */}
      <div className="sticky bottom-16 -mx-4 flex items-end gap-2 border-t border-border bg-card px-3 py-2">
        <button
          onClick={sendLocation}
          aria-label="Send location"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <MapPin className="h-5 w-5" />
        </button>
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </AppLayout>
  );
}

function statusLabel(m: Msg): string {
  if (m._queued) return "Queued";
  if (m.seen_at) return `Seen ${new Date(m.seen_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (m.delivered_at) return "Delivered";
  return "Sent";
}
