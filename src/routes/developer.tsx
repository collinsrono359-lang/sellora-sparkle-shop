import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Copy, KeyRound, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import {
  listDevApps, createDevApp, rotateDevApp, updateDevApp, deleteDevApp,
  listWebhookEndpoints, createWebhookEndpoint, deleteWebhookEndpoint,
  listRecentDeliveries, listRecentApiLogs,
} from "@/lib/devapps.functions";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [{ title: "Developer Platform — Sellora" }] }),
  component: Developer,
});

interface DevApp {
  id: string; name: string; description: string | null; website: string | null;
  key_prefix: string; scopes: string[]; platform_fee_pct: number; rate_limit_per_min: number;
  active: boolean; last_used_at: string | null; created_at: string;
}

const ALL_SCOPES = ["read_products", "write_products", "read_orders", "write_orders", "read_profile", "write_payments"];

function Developer() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<DevApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<{ name: string; secret: string } | null>(null);
  const [selected, setSelected] = useState<DevApp | null>(null);

  const listFn = useServerFn(listDevApps);
  const createFn = useServerFn(createDevApp);
  const rotateFn = useServerFn(rotateDevApp);
  const updateFn = useServerFn(updateDevApp);
  const deleteFn = useServerFn(deleteDevApp);

  async function refresh() {
    setLoading(true);
    try { const r = await listFn(); setApps(r.apps as DevApp[]); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function onCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await createFn({ data: { name: newName.trim() } });
      setRevealedSecret({ name: r.app.name, secret: r.secret });
      setNewName("");
      await refresh();
    } catch (e: any) { toast.error(e.message || "Create failed"); }
    finally { setCreating(false); }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <AppLayout>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Developer Platform</h1>
      </div>

      <Card className="mb-4 p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> Create new API key</h2>
        <div className="flex gap-2">
          <Input placeholder="App name (e.g. My Integration)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={onCreate} disabled={creating || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" />Create
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Default scopes: read_products, read_orders, read_profile. Default platform fee: 10%.
        </p>
      </Card>

      {revealedSecret && (
        <Card className="mb-4 border-primary p-4">
          <p className="mb-2 text-sm font-semibold">Save this secret now — it will not be shown again.</p>
          <p className="mb-2 text-xs text-muted-foreground">App: {revealedSecret.name}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{revealedSecret.secret}</code>
            <Button size="sm" variant="outline" onClick={() => copy(revealedSecret.secret)}><Copy className="h-3 w-3" /></Button>
          </div>
          <Button className="mt-3" size="sm" variant="ghost" onClick={() => setRevealedSecret(null)}>Dismiss</Button>
        </Card>
      )}

      <h2 className="mb-2 font-semibold">Your apps</h2>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No apps yet. Create your first API key above.</p>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.name}</span>
                    <Badge variant={a.active ? "default" : "secondary"}>{a.active ? "Active" : "Disabled"}</Badge>
                  </div>
                  <code className="mt-1 block text-xs text-muted-foreground">{a.key_prefix}…</code>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scopes: {a.scopes.join(", ")} • Fee: {(Number(a.platform_fee_pct) * 100).toFixed(1)}%
                    {a.last_used_at ? ` • Last used: ${new Date(a.last_used_at).toLocaleString()}` : " • Never used"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={() => setSelected(a)}>Manage</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Rotate key? The old key stops working immediately.")) return;
                    try {
                      const r = await rotateFn({ data: { id: a.id } });
                      setRevealedSecret({ name: a.name, secret: r.secret });
                      await refresh();
                    } catch (e: any) { toast.error(e.message); }
                  }}>
                    <RefreshCw className="mr-1 h-3 w-3" />Rotate
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <AppDetailModal
          app={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => { await refresh(); }}
          onDeleted={async () => { setSelected(null); await refresh(); }}
          updateFn={updateFn}
          deleteFn={deleteFn}
        />
      )}

      <Card className="mt-6 p-4">
        <h3 className="mb-2 font-semibold">Quick reference</h3>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><code>GET /api/public/v1/products</code> — list products</li>
          <li><code>GET /api/public/v1/products/:id</code> — get one</li>
          <li><code>POST /api/public/v1/products</code> — create (write_products)</li>
          <li><code>GET /api/public/v1/sellers/:id</code> — seller profile</li>
          <li><code>GET /api/public/v1/sellers/:id/products</code> — seller's products</li>
          <li><code>GET /api/public/v1/orders</code> — your orders</li>
          <li><code>POST /api/public/v1/orders</code> — create order (write_orders), returns approve_url</li>
          <li><code>GET /api/public/v1/users/profile</code> — your profile (read_profile)</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Auth: <code>Authorization: Bearer sk_live_…</code>. Webhook signature header:{" "}
          <code>X-Sellora-Signature: t=&lt;ts&gt;,v1=&lt;hmac_sha256(secret, ts + "." + body)&gt;</code>
        </p>
      </Card>
    </AppLayout>
  );
}

function AppDetailModal({ app, onClose, onSaved, onDeleted, updateFn, deleteFn }: {
  app: DevApp;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  updateFn: any;
  deleteFn: any;
}) {
  const [active, setActive] = useState(app.active);
  const [scopes, setScopes] = useState<string[]>(app.scopes);
  const [feePct, setFeePct] = useState<number>(Number(app.platform_fee_pct) * 100);
  const [saving, setSaving] = useState(false);

  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const listEpFn = useServerFn(listWebhookEndpoints);
  const createEpFn = useServerFn(createWebhookEndpoint);
  const deleteEpFn = useServerFn(deleteWebhookEndpoint);
  const listDelFn = useServerFn(listRecentDeliveries);
  const listLogFn = useServerFn(listRecentApiLogs);

  async function refresh() {
    const [eps, dels, lgs] = await Promise.all([
      listEpFn({ data: { appId: app.id } }),
      listDelFn({ data: { appId: app.id } }),
      listLogFn({ data: { appId: app.id } }),
    ]);
    setEndpoints(eps.endpoints); setDeliveries(dels.deliveries); setLogs(lgs.logs);
  }
  useEffect(() => { refresh(); }, [app.id]);

  async function save() {
    setSaving(true);
    try {
      await updateFn({ data: { id: app.id, active, scopes, platform_fee_pct: feePct / 100 } });
      toast.success("Saved");
      await onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-background p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{app.name}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Status</Label>
            <div className="mt-1">
              <Button size="sm" variant={active ? "default" : "outline"} onClick={() => setActive(!active)}>
                {active ? "Active" : "Disabled"}
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Platform fee % (per order placed via this key)</Label>
            <Input type="number" min={0} max={50} step={0.5} value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
          </div>

          <div>
            <Label className="text-xs">Scopes</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {ALL_SCOPES.map((s) => (
                <button key={s} onClick={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])}
                  className={`rounded-full border px-2 py-0.5 text-xs ${scopes.includes(s) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>Save</Button>
            <Button variant="destructive" onClick={async () => {
              if (!confirm("Delete this app permanently? All its webhooks and logs will be removed.")) return;
              await deleteFn({ data: { id: app.id } });
              toast.success("Deleted"); await onDeleted();
            }}><Trash2 className="mr-1 h-3 w-3" />Delete app</Button>
          </div>

          <div className="border-t pt-3">
            <h4 className="mb-2 flex items-center gap-1 font-semibold"><Webhook className="h-4 w-4" /> Webhook endpoints</h4>
            <div className="mb-2 flex gap-2">
              <Input placeholder="https://your-server.com/webhooks/sellora" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
              <Button size="sm" onClick={async () => {
                if (!newUrl.trim()) return;
                try {
                  await createEpFn({ data: { appId: app.id, url: newUrl.trim() } });
                  setNewUrl(""); await refresh();
                } catch (e: any) { toast.error(e.message); }
              }}>Add</Button>
            </div>
            {endpoints.length === 0 ? <p className="text-xs text-muted-foreground">No endpoints.</p> : (
              <div className="space-y-2">
                {endpoints.map((e) => (
                  <div key={e.id} className="rounded border border-border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="break-all">{e.url}</code>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm("Delete this endpoint?")) return;
                        await deleteEpFn({ data: { id: e.id } });
                        await refresh();
                      }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-muted-foreground">Signing secret:</span>
                      <code className="break-all">{e.secret}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(e.secret); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div className="mt-1 text-muted-foreground">Events: {e.events.join(", ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Recent deliveries</h4>
            {deliveries.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
              <div className="space-y-1 text-xs">
                {deliveries.slice(0, 10).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                    <span><Badge variant={d.status === "success" ? "default" : d.status === "dead" ? "destructive" : "secondary"}>{d.status}</Badge> {d.event_type}</span>
                    <span className="text-muted-foreground">{d.last_status_code || "-"} · {d.attempts} try{d.attempts === 1 ? "" : "s"} · {new Date(d.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Recent API requests</h4>
            {logs.length === 0 ? <p className="text-xs text-muted-foreground">No requests yet.</p> : (
              <div className="space-y-1 text-xs">
                {logs.slice(0, 15).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                    <span><Badge variant={l.status_code < 400 ? "default" : "destructive"}>{l.status_code}</Badge> {l.method} <code>{l.path}</code></span>
                    <span className="text-muted-foreground">{l.latency_ms ?? "-"}ms · {new Date(l.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}