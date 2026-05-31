import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTransaction, mapPaystackStatus } from "@/lib/paystack.server";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/paystack/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = auth.slice(7);
        const userClient = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
        );
        const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }
        const userId = claims.claims.sub;

        const url = new URL(request.url);
        const reference = url.searchParams.get("reference");
        if (!reference) {
          return Response.json({ error: "Missing reference" }, { status: 400 });
        }

        const { data: order } = await supabaseAdmin
          .from("payment_orders")
          .select("*")
          .eq("user_id", userId)
          .eq("merchant_reference", reference)
          .maybeSingle();

        if (!order) {
          return Response.json({ error: "Order not found" }, { status: 404 });
        }

        try {
          const result = await verifyTransaction(reference);
          if (!result.data) {
            return Response.json({ status: order.status, order, error: "Verification failed" }, { status: 502 });
          }

          const mapped = mapPaystackStatus(result.data.status);
          const { data: updated } = await supabaseAdmin
            .from("payment_orders")
            .update({
              status: mapped,
              payment_method: result.data.channel ?? order.payment_method,
              confirmation_code: result.data.authorization?.authorization_code ?? order.confirmation_code,
              raw_status_response: result as never,
            })
            .eq("id", order.id)
            .select("*")
            .maybeSingle();

          return Response.json({ status: mapped, order: updated || order });
        } catch (err) {
          console.error("Paystack verify error:", err);
          return Response.json({ status: order.status, order, error: "Verification failed" }, { status: 502 });
        }
      },
    },
  },
});
