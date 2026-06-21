import { createFileRoute } from "@tanstack/react-router";
import { jsonErr, jsonOk } from "@/lib/apiauth.server";

// Worker endpoint: delivers pending webhook events. Idempotent. Call periodically
// from a cron job hitting POST /api/public/v1/webhooks/deliver. Set CRON_SECRET
// and send `x-cron-secret` header to protect.
export const Route = createFileRoute("/api/public/v1/webhooks/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret && request.headers.get("x-cron-secret") !== secret) {
          return jsonErr(401, "unauthorized", "Bad cron secret");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { signWebhook } = await import("@/lib/apikey.server");

        const { data: pending, error } = await supabaseAdmin
          .from("webhook_deliveries")
          .select("id,endpoint_id,event_type,payload,attempts")
          .in("status", ["pending", "failed"])
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(50);
        if (error) return jsonErr(500, "db_error", error.message);
        if (!pending || !pending.length) return jsonOk({ delivered: 0 });

        const endpointIds = Array.from(new Set(pending.map((p) => p.endpoint_id)));
        const { data: endpoints } = await supabaseAdmin
          .from("webhook_endpoints")
          .select("id,url,secret,active")
          .in("id", endpointIds);
        const epMap = new Map((endpoints || []).map((e) => [e.id, e]));

        let delivered = 0, failed = 0;
        for (const d of pending) {
          const ep = epMap.get(d.endpoint_id);
          if (!ep || !ep.active) {
            await supabaseAdmin.from("webhook_deliveries").update({ status: "dead", last_error: "endpoint inactive" }).eq("id", d.id);
            continue;
          }
          const ts = Math.floor(Date.now() / 1000);
          const bodyStr = JSON.stringify({ id: d.id, type: d.event_type, created: ts, data: d.payload });
          const sig = signWebhook(ep.secret, bodyStr, ts);
          let ok = false, status = 0, errMsg: string | null = null;
          try {
            const r = await fetch(ep.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Sellora-Signature": sig, "X-Sellora-Event": d.event_type },
              body: bodyStr,
              signal: AbortSignal.timeout(10_000),
            });
            status = r.status;
            ok = r.ok;
            if (!ok) errMsg = `HTTP ${status}`;
          } catch (e: any) {
            errMsg = String(e?.message || e).slice(0, 300);
          }
          const attempts = (d.attempts || 0) + 1;
          if (ok) {
            await supabaseAdmin.from("webhook_deliveries").update({
              status: "success", attempts, last_status_code: status, delivered_at: new Date().toISOString(),
            }).eq("id", d.id);
            delivered++;
          } else {
            const dead = attempts >= 8;
            const delays = [60, 120, 300, 900, 3600, 21_600, 86_400, 86_400];
            const next = new Date(Date.now() + (delays[attempts - 1] || 86_400) * 1000).toISOString();
            await supabaseAdmin.from("webhook_deliveries").update({
              status: dead ? "dead" : "failed", attempts, last_status_code: status || null,
              last_error: errMsg, next_attempt_at: next,
            }).eq("id", d.id);
            failed++;
          }
        }
        return jsonOk({ delivered, failed });
      },
    },
  },
});