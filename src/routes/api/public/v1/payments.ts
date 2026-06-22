import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

const PATH = "/api/public/v1/payments";

export const Route = createFileRoute("/api/public/v1/payments")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) =>
        withApi(request, PATH, "write_payments", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
          const { data, error } = await supabaseAdmin
            .from("api_payments")
            .select("id,status,amount_usd,platform_fee_usd,net_usd,description,customer_email,customer_reference,paypal_order_id,created_at,paid_at")
            .eq("app_id", app.id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data, limit, offset });
        }),
      POST: async ({ request }) =>
        withApi(request, PATH, "write_payments", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { createPaypalOrder } = await import("@/lib/paypal.server");
          let body: any;
          try { body = await request.json(); } catch { return jsonErr(400, "invalid_json", "Body must be JSON"); }
          const amount = Number(body.amount_usd);
          if (!amount || amount < 0.5) return jsonErr(400, "invalid_amount", "amount_usd must be >= 0.50");
          if (amount > 10000) return jsonErr(400, "invalid_amount", "amount_usd must be <= 10000");
          const usd = Number(amount.toFixed(2));
          const feePct = Number(app.platform_fee_pct);
          const fee = Number((usd * feePct).toFixed(2));
          const net = Number((usd - fee).toFixed(2));
          const description = String(body.description || "API payment").slice(0, 200);

          const { data: payment, error: pErr } = await supabaseAdmin
            .from("api_payments")
            .insert({
              app_id: app.id,
              owner_id: app.owner_id,
              amount_usd: usd,
              platform_fee_pct: feePct,
              platform_fee_usd: fee,
              net_usd: net,
              description,
              customer_email: body.customer_email || null,
              customer_reference: body.customer_reference || null,
              metadata: body.metadata || null,
              return_url: body.return_url || null,
              cancel_url: body.cancel_url || null,
              mode: app.mode || "live",
            })
            .select("*").single();
          if (pErr || !payment) return jsonErr(500, "db_error", pErr?.message || "Create failed");

          const base = `https://${request.headers.get("host") || "sellora-sparkle-shop.lovable.app"}`;
          // Sandbox: skip PayPal entirely, simulate an approve_url that auto-captures
          if ((app.mode || "live") === "test") {
            const approve = `${base}/api/public/v1/payments/capture?id=${payment.id}&simulate=paid`;
            return jsonOk({
              data: {
                id: payment.id,
                mode: "test",
                status: "pending",
                amount_usd: usd,
                platform_fee_usd: fee,
                net_usd: net,
                approve_url: approve,
                note: "Sandbox payment — no real money. Open approve_url (or append &simulate=failed) to test.",
              },
            }, 201);
          }
          const pp = await createPaypalOrder({
            amountUsd: usd,
            orderId: payment.id,
            description,
            returnUrl: `${base}/api/public/v1/payments/capture?id=${payment.id}`,
            cancelUrl: body.cancel_url || `${base}/?api_payment_cancelled=1`,
          });
          await supabaseAdmin.from("api_payments")
            .update({ paypal_order_id: pp.id, raw_paypal: pp as any })
            .eq("id", payment.id);
          const approve = pp.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
          return jsonOk({
            data: {
              id: payment.id,
              status: "pending",
              amount_usd: usd,
              platform_fee_usd: fee,
              net_usd: net,
              paypal_order_id: pp.id,
              approve_url: approve?.href,
            },
          }, 201);
        }),
    },
  },
});