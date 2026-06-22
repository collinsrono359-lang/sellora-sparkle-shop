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
  listRecentDeliveries, listRecentApiLogs, listApiPayments,
} from "@/lib/devapps.functions";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [{ title: "Developer Platform — Sellora" }] }),
  component: Developer,
});

interface DevApp {
  id: string; name: string; description: string | null; website: string | null;
  key_prefix: string; scopes: string[]; platform_fee_pct: number; rate_limit_per_min: number;
  active: boolean; last_used_at: string | null; created_at: string;
  mode: "live" | "test";
}

const ALL_SCOPES = ["read_products", "write_products", "read_orders", "write_orders", "read_profile", "write_payments"];

function Developer() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<DevApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<"live" | "test">("test");
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
      const r = await createFn({ data: { name: newName.trim(), mode: newMode } });
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
        <div className="space-y-2">
          <Input placeholder="App name (e.g. My Integration)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
              <button type="button" onClick={() => setNewMode("test")}
                className={`rounded px-3 py-1 ${newMode === "test" ? "bg-primary text-primary-foreground" : ""}`}>
                Sandbox (test)
              </button>
              <button type="button" onClick={() => setNewMode("live")}
                className={`rounded px-3 py-1 ${newMode === "live" ? "bg-primary text-primary-foreground" : ""}`}>
                Live
              </button>
            </div>
            <Button onClick={onCreate} disabled={creating || !newName.trim()} className="ml-auto">
              <Plus className="mr-1 h-4 w-4" />Create {newMode === "test" ? "sandbox" : "live"} key
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <b>Sandbox keys</b> (<code>sk_test_…</code>) charge nothing — payments auto-complete via a simulated approve URL and
          do <b>not</b> credit your wallet. Use them while building. Switch to a <b>live key</b> (<code>sk_live_…</code>) to
          accept real payments. Default scopes: read_products, read_orders, read_profile. Default platform fee: 10%.
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
                    <Badge variant={a.mode === "test" ? "secondary" : "default"}>
                      {a.mode === "test" ? "Sandbox" : "Live"}
                    </Badge>
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

      <IntegrationGuide />
    </AppLayout>
  );
}

function IntegrationGuide() {
  const base = typeof window !== "undefined" ? window.location.origin : "https://sellora-sparkle-shop.lovable.app";
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  const Block = ({ code }: { code: string }) => (
    <div className="relative">
      <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px] leading-relaxed"><code>{code}</code></pre>
      <Button size="sm" variant="ghost" className="absolute right-1 top-1 h-6" onClick={() => copy(code)}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
  return (
    <Card className="mt-6 space-y-4 p-4 text-sm">
      <div>
        <h3 className="font-semibold">Integrate Sellora into your app</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The Sellora REST API lets your website, mobile app, or backend list products,
          place orders, and accept payments through Sellora's payment rails. All requests
          go to <code>{base}/api/public/v1/*</code>.
        </p>
      </div>

      <div>
        <h4 className="mb-1 font-semibold">1 · Get a sandbox key</h4>
        <p className="text-xs text-muted-foreground">
          Create an app above with mode = <b>Sandbox</b>. You'll see your secret once
          (<code>sk_test_…</code>). Save it in your server's environment as <code>SELLORA_API_KEY</code>.
          Never expose it in browser code.
        </p>
      </div>

      <div>
        <h4 className="mb-1 font-semibold">2 · Authenticate</h4>
        <Block code={`curl ${base}/api/public/v1/products \\
  -H "Authorization: Bearer sk_test_xxxxxxxxxxxx"`} />
      </div>

      <div>
        <h4 className="mb-1 font-semibold">3 · List or fetch products</h4>
        <Block code={`GET  /api/public/v1/products?limit=20&offset=0
GET  /api/public/v1/products/{id}
GET  /api/public/v1/sellers/{id}
GET  /api/public/v1/sellers/{id}/products`} />
      </div>

      <div>
        <h4 className="mb-1 font-semibold">4 · Accept payments (Sellora handles checkout)</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          Create a payment on your server, then redirect the customer to <code>approve_url</code>.
          After they pay, they're redirected to your <code>return_url</code>. Net amount
          (after your app's platform fee) lands in your Sellora wallet automatically.
        </p>
        <Block code={`curl -X POST ${base}/api/public/v1/payments \\
  -H "Authorization: Bearer sk_test_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_usd": 29.99,
    "description": "Pro plan - monthly",
    "customer_email": "buyer@example.com",
    "return_url": "https://yourapp.com/billing/success",
    "cancel_url": "https://yourapp.com/billing/cancel",
    "metadata": { "user_id": "u_123" }
  }'`} />
        <p className="mt-2 text-xs text-muted-foreground">
          Response includes <code>id</code> and <code>approve_url</code>. In sandbox the
          approve URL auto-completes the payment; append <code>&simulate=failed</code> to test failures.
        </p>
      </div>

      <div>
        <h4 className="mb-1 font-semibold">5 · Listen for webhooks</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          In an app's <b>Manage</b> panel, add a webhook endpoint URL. Sellora signs every
          request so you can verify it came from us. Events: <code>order.created</code>,
          <code> order.paid</code>, <code>order.released</code>, <code>order.failed</code>,
          <code> product.created</code>.
        </p>
        <Block code={`// Node / Express verification
import crypto from "crypto";
app.post("/webhooks/sellora", express.raw({ type: "*/*" }), (req, res) => {
  const header = req.headers["x-sellora-signature"]; // "t=<ts>,v1=<hmac>"
  const [t, v1] = header.split(",").map(p => p.split("=")[1]);
  const expected = crypto.createHmac("sha256", process.env.SELLORA_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body.toString()}\`).digest("hex");
  if (expected !== v1) return res.status(401).end();
  const event = JSON.parse(req.body.toString());
  // handle event.type, event.data ...
  res.json({ ok: true });
});`} />
      </div>

      <div>
        <h4 className="mb-1 font-semibold">6 · Embed a Buy button</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          Easiest way to charge customers from a static site — your server creates the
          payment, returns the <code>approve_url</code>, the button opens it.
        </p>
        <Block code={`<button id="buy">Buy for $29.99</button>
<script>
  document.getElementById("buy").onclick = async () => {
    const r = await fetch("/api/checkout", { method: "POST" }).then(r => r.json());
    window.location = r.approve_url;
  };
</script>`} />
      </div>

      <div>
        <h4 className="mb-1 font-semibold">Endpoint reference</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><code>GET    /api/public/v1/products</code> — list (read_products)</li>
          <li><code>GET    /api/public/v1/products/:id</code> — fetch one</li>
          <li><code>POST   /api/public/v1/products</code> — create (write_products)</li>
          <li><code>PUT    /api/public/v1/products/:id</code> — update (write_products)</li>
          <li><code>GET    /api/public/v1/sellers/:id</code> — seller profile</li>
          <li><code>GET    /api/public/v1/sellers/:id/products</code> — seller's products</li>
          <li><code>GET    /api/public/v1/orders</code> — your orders (read_orders)</li>
          <li><code>POST   /api/public/v1/orders</code> — checkout an existing product (write_orders)</li>
          <li><code>GET    /api/public/v1/users/profile</code> — your profile (read_profile)</li>
          <li><code>POST   /api/public/v1/payments</code> — charge any amount (write_payments)</li>
          <li><code>GET    /api/public/v1/payments</code> — list charges (write_payments)</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Errors return <code>{`{ error: { code, message } }`}</code> with HTTP 4xx/5xx.
          Rate limit: 60 req/min per key (configurable). Need a higher limit or extra
          scopes? Edit the app in <b>Manage</b>.
        </p>
      </div>
    </Card>
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
  const [payments, setPayments] = useState<any[]>([]);

  const listEpFn = useServerFn(listWebhookEndpoints);
  const createEpFn = useServerFn(createWebhookEndpoint);
  const deleteEpFn = useServerFn(deleteWebhookEndpoint);
  const listDelFn = useServerFn(listRecentDeliveries);
  const listLogFn = useServerFn(listRecentApiLogs);
  const listPayFn = useServerFn(listApiPayments);

  async function refresh() {
    const [eps, dels, lgs, pays] = await Promise.all([
      listEpFn({ data: { appId: app.id } }),
      listDelFn({ data: { appId: app.id } }),
      listLogFn({ data: { appId: app.id } }),
      listPayFn({ data: { appId: app.id } }),
    ]);
    setEndpoints(eps.endpoints); setDeliveries(dels.deliveries); setLogs(lgs.logs); setPayments(pays.payments);
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

          <div className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Platform payments</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Charges your integration created via <code>POST /api/public/v1/payments</code>.
              Paid amounts (net of {(Number(app.platform_fee_pct) * 100).toFixed(1)}% fee) land in your{" "}
              <a className="underline" href="/wallet">wallet</a> automatically.
            </p>
            {payments.length === 0 ? <p className="text-xs text-muted-foreground">No payments yet.</p> : (
              <div className="space-y-1 text-xs">
                {payments.slice(0, 15).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                    <span className="min-w-0 flex-1 truncate">
                      <Badge variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>{" "}
                      ${Number(p.amount_usd).toFixed(2)} → net ${Number(p.net_usd).toFixed(2)}
                      {p.description ? ` · ${p.description}` : ""}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
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