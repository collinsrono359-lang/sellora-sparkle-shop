import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { paypalAccessToken } from "@/lib/paypal.server";

async function verify(req: Request, body: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("[paypal/webhook] PAYPAL_WEBHOOK_ID not set; skipping verify");
    return true;
  }
  const headers = req.headers;
  const payload = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  };
  const env = (process.env.PAYPAL_ENV || "live").toLowerCase();
  const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const token = await paypalAccessToken();
  const r = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return false;
  const j = await r.json() as { verification_status: string };
  return j.verification_status === "SUCCESS";
}

export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const ok = await verify(request, body);
        if (!ok) return new Response("Invalid signature", { status: 401 });
        const evt = JSON.parse(body) as { event_type: string; resource: any };
        const type = evt.event_type;
        const res = evt.resource || {};
        try {
          if (type === "CHECKOUT.ORDER.APPROVED" || type === "PAYMENT.CAPTURE.COMPLETED") {
            const ppOrderId = res.supplementary_data?.related_ids?.order_id || res.id;
            if (ppOrderId) {
              await supabaseAdmin.from("orders").update({
                status: "paid", paypal_capture_id: res.id, raw_paypal: evt,
              }).eq("paypal_order_id", ppOrderId).eq("status", "pending");
            }
          } else if (type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.DECLINED") {
            const ppOrderId = res.supplementary_data?.related_ids?.order_id;
            if (ppOrderId) {
              await supabaseAdmin.from("orders").update({
                status: "failed", raw_paypal: evt,
              }).eq("paypal_order_id", ppOrderId);
            }
          } else if (type === "PAYMENT.CAPTURE.REFUNDED") {
            const ppOrderId = res.supplementary_data?.related_ids?.order_id;
            if (ppOrderId) {
              await supabaseAdmin.from("orders").update({
                status: "refunded", raw_paypal: evt,
              }).eq("paypal_order_id", ppOrderId);
            }
          } else if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
            const batchId = res.payout_batch_id;
            const itemId = res.payout_item_id;
            const status = (res.transaction_status || "").toUpperCase();
            const map: Record<string, string> = {
              SUCCESS: "paid", FAILED: "failed", DENIED: "failed",
              BLOCKED: "failed", REFUNDED: "failed", RETURNED: "failed",
              UNCLAIMED: "pending", PENDING: "processing",
            };
            const newStatus = map[status] || "processing";
            await supabaseAdmin.from("withdrawals").update({
              status: newStatus as any,
              paypal_item_id: itemId,
              paid_at: newStatus === "paid" ? new Date().toISOString() : null,
              failure_reason: newStatus === "failed" ? (res.errors?.message || status) : null,
              raw_paypal: evt,
            }).eq("paypal_batch_id", batchId);
          }
        } catch (e) {
          console.error("[paypal/webhook] handler error:", e);
        }
        return new Response("ok");
      },
    },
  },
});