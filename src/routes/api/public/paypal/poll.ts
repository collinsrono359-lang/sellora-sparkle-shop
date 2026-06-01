import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { capturePaypalOrder, getPaypalOrder } from "@/lib/paypal.server";

const BACKOFF = [30, 120, 600, 3600, 21600, 86400];

async function handler() {
  const { data: jobs } = await supabaseAdmin
    .from("payment_poll_jobs").select("*")
    .eq("done", false).lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true }).limit(25);
  const processed: any[] = [];
  for (const job of jobs || []) {
    const { data: order } = await supabaseAdmin
      .from("orders").select("*").eq("id", job.order_id).maybeSingle();
    if (!order || !order.paypal_order_id || order.status !== "pending") {
      await supabaseAdmin.from("payment_poll_jobs").update({ done: true }).eq("id", job.id);
      continue;
    }
    const attempts = job.attempts + 1;
    let nextStatus: string = order.status;
    let lastError: string | null = null;
    try {
      const pp = await getPaypalOrder(order.paypal_order_id);
      if (pp.status === "APPROVED") {
        const cap = await capturePaypalOrder(order.paypal_order_id);
        if ((cap.status || "").toUpperCase() === "COMPLETED") {
          await supabaseAdmin.from("orders").update({
            status: "paid",
            paypal_capture_id: cap.purchase_units?.[0]?.payments?.captures?.[0]?.id,
            raw_paypal: cap,
          }).eq("id", order.id).eq("status", "pending");
          nextStatus = "paid";
        }
      } else if (pp.status === "COMPLETED") {
        await supabaseAdmin.from("orders").update({ status: "paid", raw_paypal: pp })
          .eq("id", order.id).eq("status", "pending");
        nextStatus = "paid";
      } else if (pp.status === "VOIDED" || pp.status === "EXPIRED") {
        await supabaseAdmin.from("orders").update({ status: "failed", raw_paypal: pp })
          .eq("id", order.id).eq("status", "pending");
        nextStatus = "failed";
      }
    } catch (e: any) {
      lastError = String(e.message).slice(0, 500);
    }
    if (nextStatus === "pending" && attempts >= BACKOFF.length + 1) {
      await supabaseAdmin.from("orders").update({ status: "failed" })
        .eq("id", order.id).eq("status", "pending");
      await supabaseAdmin.from("payment_poll_jobs").update({
        done: true, attempts, last_error: lastError,
      }).eq("id", job.id);
    } else if (nextStatus !== "pending") {
      await supabaseAdmin.from("payment_poll_jobs").update({
        done: true, attempts, last_error: lastError,
      }).eq("id", job.id);
    } else {
      const sec = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
      await supabaseAdmin.from("payment_poll_jobs").update({
        attempts, last_error: lastError,
        next_run_at: new Date(Date.now() + sec * 1000).toISOString(),
      }).eq("id", job.id);
    }
    processed.push({ orderId: order.id, status: nextStatus, attempts });
  }
  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/paypal/poll")({
  server: { handlers: { POST: handler, GET: handler } },
});