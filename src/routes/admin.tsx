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
interface Appeal { id: string; user_id: string; message: string; status: "pending" | "approved" | "rejected"; admin_response: string | null; created_at: string }
interface PendingProduct { id: string; title: string; price: number; currency: string; seller_id: string; photos: string[]; location: string | null; created_at: string }

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ users: 0, products: 0, reports: 0 });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = (data ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) return;
      const [{ data: rep }, { count: pCount }, { count: uCount }, { data: ap }, { data: pend }] = await Promise.all([
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
      ]);
      setReports((rep as Report[]) ?? []);
      setAppeals((ap as Appeal[]) ?? []);
      setPending((pend as PendingProduct[]) ?? []);
      setStats({ users: uCount ?? 0, products: pCount ?? 0, reports: rep?.length ?? 0 });
    })();
  }, [user, loading, navigate]);

  if (isAdmin === false) return <AppLayout><p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">You don't have admin access.</p></AppLayout>;
  if (isAdmin === null) return <AppLayout><p className="p-8 text-center text-muted-foreground">Loading...</p></AppLayout>;

  const resolve = async (id: string) => {
    await supabase.from("reports").update({ resolved: true }).eq("id", id);
    setReports((r) => r.filter((x) => x.id !== id));
    toast.success("Report resolved");
  };

  const decideAppeal = async (id: string, status: "approved" | "rejected") => {
    const note = responses[id]?.trim() || null;
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
      <div className="grid grid-cols-3 gap-2">
        {[["Users", stats.users], ["Active products", stats.products], ["Open reports", stats.reports]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-primary">{v}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>

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

      <h2 className="mt-6 mb-2 text-lg font-bold">Appeal queue</h2>
      <ul className="space-y-2">
        {appeals.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No pending appeals
          </p>
        )}
        {appeals.map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">User {a.user_id.slice(0, 8)}…</span>
              <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{a.message}</p>
            <textarea
              value={responses[a.id] ?? ""}
              onChange={(e) => setResponses((r) => ({ ...r, [a.id]: e.target.value }))}
              placeholder="Optional response to the user…"
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
