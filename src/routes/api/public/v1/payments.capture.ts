import { createFileRoute } from "@tanstack/react-router";

// Public capture/return URL. Buyers are redirected here by PayPal after approving.
// We capture the PayPal order; the BEFORE UPDATE trigger credits the app owner's wallet.
export const Route = createFileRoute("/api/public/v1/payments/capture")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { capturePaypalOrder } = await import("@/lib/paypal.server");
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const simulate = url.searchParams.get("simulate"); // sandbox only
        if (!id) return new Response("Missing id", { status: 400 });
        const { data: payment } = await supabaseAdmin
          .from("api_payments").select("*").eq("id", id).maybeSingle();
        if (!payment) return new Response("Payment not found", { status: 404 });
        const redirectTo = payment.return_url || "/";
        if (payment.status === "paid") {
          return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "status=paid&id=" + id, 302);
        }
        // Sandbox simulation: no PayPal call
        if (payment.mode === "test") {
          const next = simulate === "failed" ? "failed" : "paid";
          await supabaseAdmin.from("api_payments").update({ status: next }).eq("id", id);
          return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "status=" + next + "&id=" + id + "&mode=test", 302);
        }
        if (!payment.paypal_order_id) return new Response("Order not initialised", { status: 400 });
        try {
          const cap = await capturePaypalOrder(payment.paypal_order_id);
          const captureId =
            cap?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
          const status = (cap?.status || "").toUpperCase() === "COMPLETED" ? "paid" : "pending";
          await supabaseAdmin.from("api_payments").update({
            status, paypal_capture_id: captureId, raw_paypal: cap as any,
          }).eq("id", id);
          return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "status=" + status + "&id=" + id, 302);
        } catch (e: any) {
          await supabaseAdmin.from("api_payments").update({
            status: "failed", raw_paypal: { error: String(e?.message || e) } as any,
          }).eq("id", id);
          return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "status=failed&id=" + id, 302);
        }
      },
    },
  },
});