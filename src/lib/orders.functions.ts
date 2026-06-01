import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toUsd } from "@/lib/fx.server";
import { createPaypalOrder, capturePaypalOrder, getPaypalOrder } from "@/lib/paypal.server";
import { getRequestHost } from "@tanstack/react-start/server";

const FEE_PCT = 0.10;

function origin(): string {
  try {
    const host = getRequestHost();
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  } catch {
    return "https://sellora-sparkle-shop.lovable.app";
  }
}

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string; buyerEmail?: string; buyerName?: string; notes?: string }) =>
    z.object({
      productId: z.string().uuid(),
      buyerEmail: z.string().email().optional(),
      buyerName: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: product, error: pErr } = await supabaseAdmin
      .from("products").select("*").eq("id", data.productId).maybeSingle();
    if (pErr || !product) throw new Error("Product not found");
    if (product.seller_id === userId) throw new Error("You cannot buy your own product");
    if (product.status !== "active") throw new Error("Product is not available");

    const { usd, rate } = await toUsd(Number(product.price), product.currency || "KES");
    if (usd < 0.01) throw new Error("Amount too small to charge");
    const fee = Number((usd * FEE_PCT).toFixed(2));
    const net = Number((usd - fee).toFixed(2));

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        buyer_id: userId,
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
        buyer_email: data.buyerEmail || null,
        buyer_name: data.buyerName || null,
        notes: data.notes || null,
      })
      .select("*")
      .single();
    if (oErr || !order) throw new Error(oErr?.message || "Order create failed");

    const base = origin();
    const pp = await createPaypalOrder({
      amountUsd: usd,
      orderId: order.id,
      description: product.title,
      returnUrl: `${base}/api/paypal/capture?order=${order.id}`,
      cancelUrl: `${base}/checkout/${product.id}?cancelled=1`,
    });

    await supabaseAdmin.from("orders").update({ paypal_order_id: pp.id, raw_paypal: pp as any }).eq("id", order.id);
    await supabaseAdmin.from("payment_poll_jobs").insert({ order_id: order.id });

    const approve = pp.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
    return { orderId: order.id, paypalOrderId: pp.id, approveUrl: approve?.href };
  });

export const reconcileOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Order not found");
    if (order.buyer_id !== userId && order.seller_id !== userId) throw new Error("Forbidden");
    if (order.status !== "pending" || !order.paypal_order_id) return { status: order.status };
    try {
      const pp = await getPaypalOrder(order.paypal_order_id);
      if (pp.status === "APPROVED") {
        const cap = await capturePaypalOrder(order.paypal_order_id);
        const captureId = cap?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        await supabaseAdmin.from("orders").update({
          status: "paid", paypal_capture_id: captureId, raw_paypal: cap as any,
        }).eq("id", order.id);
        return { status: "paid" };
      }
      if (pp.status === "COMPLETED") {
        await supabaseAdmin.from("orders").update({ status: "paid", raw_paypal: pp as any }).eq("id", order.id);
        return { status: "paid" };
      }
      return { status: order.status, paypal: pp.status };
    } catch (e: any) {
      return { status: order.status, error: e.message };
    }
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    return { orders: data || [] };
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order } = await supabase.from("orders").select("*").eq("id", data.id).maybeSingle();
    return { order };
  });