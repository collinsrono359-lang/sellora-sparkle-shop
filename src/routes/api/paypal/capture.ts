import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { capturePaypalOrder, getPaypalOrder } from "@/lib/paypal.server";

export const Route = createFileRoute("/api/paypal/capture")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order");
        const token = url.searchParams.get("token");
        if (!orderId) return new Response("Missing order", { status: 400 });
        const { data: order } = await supabaseAdmin
          .from("orders").select("*").eq("id", orderId).maybeSingle();
        if (!order) return new Response("Order not found", { status: 404 });
        const ppId = token || order.paypal_order_id;
        const redirectTo = (path: string) =>
          new Response(null, { status: 302, headers: { Location: path } });
        if (!ppId) return redirectTo(`/orders/${order.id}?status=missing`);
        try {
          let capRes: any;
          try {
            capRes = await capturePaypalOrder(ppId);
          } catch (e: any) {
            if (String(e.message).includes("ORDER_ALREADY_CAPTURED")) {
              capRes = await getPaypalOrder(ppId);
            } else { throw e; }
          }
          const captureId = capRes?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
          const status = (capRes?.status || "").toUpperCase();
          if (status === "COMPLETED") {
            await supabaseAdmin.from("orders").update({
              status: "paid", paypal_capture_id: captureId, raw_paypal: capRes,
            }).eq("id", order.id).eq("status", "pending");
            return redirectTo(`/orders/${order.id}?status=paid`);
          }
          return redirectTo(`/orders/${order.id}?status=pending`);
        } catch (e: any) {
          await supabaseAdmin.from("orders").update({
            status: "failed", raw_paypal: { error: String(e.message) },
          }).eq("id", order.id).eq("status", "pending");
          return redirectTo(`/orders/${order.id}?status=failed`);
        }
      },
    },
  },
});