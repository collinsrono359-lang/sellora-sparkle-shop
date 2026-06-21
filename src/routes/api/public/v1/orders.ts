import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

const PATH = "/api/public/v1/orders";

export const Route = createFileRoute("/api/public/v1/orders")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) =>
        withApi(request, PATH, "read_orders", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
          const { data, error } = await supabaseAdmin
            .from("orders")
            .select("id,status,product_id,product_title,buyer_id,seller_id,usd_amount,platform_fee_usd,seller_net_usd,created_at,paid_at,released_at")
            .or(`buyer_id.eq.${app.owner_id},seller_id.eq.${app.owner_id}`)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data, limit, offset });
        }),
      POST: async ({ request }) =>
        withApi(request, PATH, "write_orders", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { toUsd } = await import("@/lib/fx.server");
          const { createPaypalOrder } = await import("@/lib/paypal.server");
          let body: any;
          try { body = await request.json(); } catch { return jsonErr(400, "invalid_json", "Body must be JSON"); }
          if (!body.product_id) return jsonErr(400, "missing_field", "Missing: product_id");
          const { data: product } = await supabaseAdmin.from("products").select("*").eq("id", body.product_id).maybeSingle();
          if (!product) return jsonErr(404, "not_found", "Product not found");
          if (product.seller_id === app.owner_id) return jsonErr(400, "self_purchase", "Cannot buy your own product");
          if (product.status !== "active") return jsonErr(400, "unavailable", "Product is not active");
          const { usd, rate } = await toUsd(Number(product.price), product.currency || "KES");
          if (usd < 0.01) return jsonErr(400, "amount_too_small", "Amount too small");
          const fee = Number((usd * Number(app.platform_fee_pct)).toFixed(2));
          const net = Number((usd - fee).toFixed(2));
          const { data: order, error: oErr } = await supabaseAdmin
            .from("orders")
            .insert({
              buyer_id: app.owner_id,
              seller_id: product.seller_id,
              product_id: product.id,
              product_title: product.title,
              original_price: product.price,
              original_currency: product.currency || "KES",
              usd_amount: usd,
              fx_rate: rate,
              platform_fee_usd: fee,
              seller_net_usd: net,
              status: "pending",
              buyer_email: body.buyer_email || null,
              buyer_name: body.buyer_name || null,
              notes: body.notes || null,
            })
            .select("*").single();
          if (oErr || !order) return jsonErr(500, "db_error", oErr?.message || "Order create failed");
          const base = `https://${request.headers.get("host") || "sellora-sparkle-shop.lovable.app"}`;
          const pp = await createPaypalOrder({
            amountUsd: usd,
            orderId: order.id,
            description: product.title,
            returnUrl: body.return_url || `${base}/api/paypal/capture?order=${order.id}`,
            cancelUrl: body.cancel_url || `${base}/checkout/${product.id}?cancelled=1`,
          });
          await supabaseAdmin.from("orders").update({ paypal_order_id: pp.id, raw_paypal: pp as any }).eq("id", order.id);
          const approve = pp.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
          return jsonOk({ data: { order_id: order.id, paypal_order_id: pp.id, approve_url: approve?.href, status: "pending", usd_amount: usd, platform_fee_usd: fee } }, 201);
        }),
    },
  },
});