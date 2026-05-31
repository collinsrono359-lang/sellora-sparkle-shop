import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Sellora" }] }),
  component: Admin,
});

interface Report { id: string; reason: string; details: string | null; severity: number; resolved: boolean; created_at: string; reporter_id: string; target_user_id: string | null; target_product_id: string | null }
interface Appeal { id: string; user_id: string; flag_id: string | null; message: string; status: "pending" | "approved" | "rejected"; admin_response: string | null; created_at: string; full_name: string | null; is_critical: boolean }
interface PendingProduct { id: string; title: string; price: number; currency: string; seller_id: string; photos: string[]; location: string | null; created_at: string }
interface SuspendedUser { user_id: string; display_name: string | null; avatar_url: string | null; suspended_until: string | null; warning_count: number; permanent_ban: boolean; ban_reason: string | null }
interface AnyProduct { id: string; title: string; price: number; currency: string; seller_id: string; photos: string[]; status: string; created_at: string }
interface AppealVerdict { recommendation: "approve" | "reject" | "uncertain"; confidence: "low" | "medium" | "high"; reason: string; was_mistake: boolean }

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ users: 0, products: 0, reports: 0, suspended: 0 });
  const [suspended, setSuspended] = useState<SuspendedUser[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<AnyProduct[]>([]);
  const [aiVerdicts, setAiVerdicts] = useState<Record<string, { loading: boolean; verdict: AppealVerdict | null; error?: string }>>({});
  const [autoApprove, setAutoApprove] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = (data ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) return;
      const nowIso = new Date().toISOString();
      const [{ data: rep }, { count: pCount }, { count: uCount }, { data: ap }, { data: pend }, { data: susp }] = await Promise.all([
        supabase.from("reports").select("*").eq("resolved", false).order("severity", { ascending: false }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("moderation_appeals" as any) as any)
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("products") as any)
          .select("id,title,price,currency,seller_id,photos,location,created_at")
          .eq("status", "pending_review")
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("user_id,display_name,avatar_url,suspended_until,warning_count,permanent_ban,ban_reason")
          .or(`suspended_until.gt.${nowIso},permanent_ban.eq.true`)
          .order("suspended_until", { ascending: false })
          .limit(100),
      ]);
      setReports((rep as Report[]) ?? []);
      setAppeals((ap as Appeal[]) ?? []);
      setPending((pend as PendingProduct[]) ?? []);
      setSuspended((susp as SuspendedUser[]) ?? []);
      setStats({ users: uCount ?? 0, products: pCount ?? 0, reports: rep?.length ?? 0, suspended: susp?.length ?? 0 });
    })();
  }, [user, loading, navigate]);

  if (isAdmin === false) return <AppLayout><p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">You don't have admin access.</p></AppLayout>;
  if (isAdmin === null) return <AppLayout><p className="p-8 text-center text-muted-foreground">Loading...</p></AppLayout>;

  const resolve = async (id: string) => {
    await supabase.from("reports").update({ resolved: true }).eq("id", id);
    setReports((r) => r.filter((x) => x.id !== id));
    toast.success("Report resolved");
  };

  const unsuspend = async (userId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("profiles") as any)
      .update({ suspended_until: null, permanent_ban: false, warning_count: 0, ban_reason: null })
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    // Acknowledge any open flags so banners disappear
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("moderation_flags" as any) as any).update({ acknowledged: true }).eq("user_id", userId).eq("acknowledged", false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("notifications") as any).insert({
      user_id: userId,
      category: "system",
      title: "Account restored",
      body: "An admin has lifted your suspension. You can post and message normally.",
      read: false,
    });
    setSuspended((s) => s.filter((u) => u.user_id !== userId));
    setStats((p) => ({ ...p, suspended: Math.max(0, p.suspended - 1) }));
    toast.success("User unsuspended");
  };

  const sendQuickMessage = async (toUserId: string) => {
    if (!user) return;
    const text = prompt("Message from Sellora Official:");
    if (!text || text.trim().length < 2) return;
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: toUserId,
      body: text.trim(),
      kind: "text",
    });
    if (error) return toast.error(error.message);
    toast.success("Message sent");
  };

  const sendNotification = async (toUserId: string) => {
    const title = prompt("Notification title:");
    if (!title) return;
    const body = prompt("Notification body (optional):") ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("notifications") as any).insert({
      user_id: toUserId,
      category: "system",
      title: title.trim(),
      body: body.trim() || null,
      read: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Notification sent");
  };

  const searchProducts = async () => {
    const q = productQuery.trim();
    let query = supabase.from("products").select("id,title,price,currency,seller_id,photos,status,created_at").order("created_at", { ascending: false }).limit(50);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, error } = await query;
    if (error) return toast.error(error.message);
    setProductResults((data as AnyProduct[]) ?? []);
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setProductResults((p) => p.filter((x) => x.id !== id));
    toast.success("Product deleted");
  };

  const runAiReview = async (appealId: string, auto: boolean) => {
    setAiVerdicts((m) => ({ ...m, [appealId]: { loading: true, verdict: null } }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/review-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appealId, autoApprove: auto }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = await res.json() as { verdict: AppealVerdict | null; autoApplied: boolean };
      setAiVerdicts((m) => ({ ...m, [appealId]: { loading: false, verdict: json.verdict } }));
      if (json.autoApplied) {
        toast.success("AI auto-approved the appeal");
        setAppeals((list) => list.filter((a) => a.id !== appealId));
      } else if (json.verdict) {
        const verb = json.verdict.recommendation === "approve" ? "Approve" : json.verdict.recommendation === "reject" ? "Reject" : "Review manually";
        toast.info(`AI suggests: ${verb} (${json.verdict.confidence} confidence)`);
      } else {
        toast.error("AI review unavailable");
      }
    } catch (e) {
      setAiVerdicts((m) => ({ ...m, [appealId]: { loading: false, verdict: null, error: e instanceof Error ? e.message : "Failed" } }));
      toast.error(e instanceof Error ? e.message : "AI review failed");
    }
  };

  const decideAppeal = async (id: string, status: "approved" | "rejected") => {
    const note = responses[id]?.trim() || null;
    if (!note && !confirm(`Confirm ${status} this appeal with no admin note?`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("moderation_appeals" as any) as any)
      .update({ status, admin_response: note, reviewed_by: user!.id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setAppeals((list) => list.filter((a) => a.id !== id));
    toast.success(status === "approved" ? "Appeal approved — user restored" : "Appeal rejected");
  };

  const decidePending = async (id: string, approve: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("products") as any)
      .update({ status: approve ? "active" : "archived" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setPending((list) => list.filter((p) => p.id !== id));
    toast.success(approve ? "Listing approved & published" : "Listing rejected");
  };

  return (
    <AppLayout>
      <h1 className="mb-3 text-xl font-bold">Admin</h1>
      <div className="grid grid-cols-4 gap-2">
        {[["Users", stats.users], ["Products", stats.products], ["Reports", stats.reports], ["Suspended", stats.suspended]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-primary">{v}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-5 mb-2 text-lg font-bold">Suspended users ({suspended.length})</h2>
      <ul className="space-y-2">
        {suspended.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No suspended users</p>
        )}
        {suspended.map((u) => (
          <li key={u.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{u.display_name ?? u.user_id.slice(0, 8)} {u.permanent_ban && <span className="ml-1 rounded bg-destructive/20 px-1.5 text-[10px] font-semibold text-destructive">BANNED</span>}</p>
              <p className="text-xs text-muted-foreground">
                {u.permanent_ban ? (u.ban_reason ?? "Permanent ban") : u.suspended_until ? `Until ${new Date(u.suspended_until).toLocaleString()}` : ""} · warnings {u.warning_count}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => unsuspend(u.user_id)} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white">Unsuspend</button>
                <button onClick={() => sendQuickMessage(u.user_id)} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">Message</button>
                <button onClick={() => sendNotification(u.user_id)} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">Notify</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-5 mb-2 text-lg font-bold">All products</h2>
      <div className="mb-2 flex gap-2">
        <input
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") searchProducts(); }}
          placeholder="Search products by title (or leave blank for most recent)"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button onClick={searchProducts} className="rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">Search</button>
      </div>
      <ul className="space-y-2">
        {productResults.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
            {p.photos?.[0] && <img src={p.photos[0]} alt="" className="h-14 w-14 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.currency} {Number(p.price).toLocaleString()} · {p.status}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => deleteProduct(p.id)} className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground">Delete</button>
                <button onClick={() => sendQuickMessage(p.seller_id)} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">Message seller</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-5 mb-2 text-lg font-bold">Listings awaiting review ({pending.length})</h2>
      <ul className="space-y-2">
        {pending.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No expensive listings pending review</p>
        )}
        {pending.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
            {p.photos?.[0] && <img src={p.photos[0]} alt="" className="h-16 w-16 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.currency} {Number(p.price).toLocaleString()} · {p.location ?? "—"}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decidePending(p.id, true)} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white">Approve</button>
                <button onClick={() => decidePending(p.id, false)} className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground">Reject</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-5 mb-2 text-lg font-bold">Report queue</h2>
      <ul className="space-y-2">
        {reports.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No open reports</p>}
        {reports.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium capitalize text-destructive">{r.reason}</span>
              <span className="text-xs text-muted-foreground">Severity {r.severity}</span>
            </div>
            {r.details && <p className="mt-2 text-sm">{r.details}</p>}
            <button onClick={() => resolve(r.id)} className="mt-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Resolve</button>
          </li>
        ))}
      </ul>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">Appeal queue</h2>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          AI auto-approves obvious mistakes
        </label>
      </div>
      <ul className="space-y-2">
        {appeals.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No pending appeals
          </p>
        )}
        {appeals.map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">User {a.user_id.slice(0, 8)}… {a.is_critical && <span className="ml-1 rounded bg-destructive/20 px-1 text-[10px] font-semibold text-destructive">CRITICAL</span>}</span>
              <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{a.message}</p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => runAiReview(a.id, autoApprove)}
                disabled={aiVerdicts[a.id]?.loading}
                className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary disabled:opacity-60"
              >
                {aiVerdicts[a.id]?.loading ? "AI reviewing…" : "🤖 Run AI review"}
              </button>
              <button onClick={() => sendQuickMessage(a.user_id)} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">Message user</button>
              <button onClick={() => navigate({ to: "/shop/$id", params: { id: a.user_id } })} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">View profile</button>
            </div>

            {aiVerdicts[a.id]?.verdict && (
              <div className={`rounded-md border p-2 text-xs ${
                aiVerdicts[a.id].verdict!.recommendation === "approve"
                  ? "border-green-500/40 bg-green-500/10"
                  : aiVerdicts[a.id].verdict!.recommendation === "reject"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}>
                <p className="mb-1 font-semibold capitalize">
                  AI: {aiVerdicts[a.id].verdict!.recommendation} ({aiVerdicts[a.id].verdict!.confidence} confidence)
                  {aiVerdicts[a.id].verdict!.was_mistake && " · likely mistake"}
                </p>
                <p className="text-muted-foreground">{aiVerdicts[a.id].verdict!.reason}</p>
              </div>
            )}

            <textarea
              value={responses[a.id] ?? ""}
              onChange={(e) => setResponses((r) => ({ ...r, [a.id]: e.target.value }))}
              placeholder="Reason for approval/rejection (sent to the user)…"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                onClick={() => decideAppeal(a.id, "approved")}
                className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white"
              >
                Approve & restore
              </button>
              <button
                onClick={() => decideAppeal(a.id, "rejected")}
                className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}
