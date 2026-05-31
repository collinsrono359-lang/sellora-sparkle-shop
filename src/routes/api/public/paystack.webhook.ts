import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTransaction, mapPaystackStatus } from "@/lib/paystack.server";

const BOOST_DURATION_DAYS: Record<string, number> = {
  boost_bronze: 3,
  boost_silver: 7,
  boost_gold: 14,
};

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  purpose: string;
  metadata: Record<string, unknown> | null;
}

async function fulfillBenefits(reference: string) {
  const { data: row } = await supabaseAdmin
    .from("payment_orders")
    .select("id,user_id,status,purpose,metadata")
    .eq("merchant_reference", reference)
    .maybeSingle();

  const order = row as OrderRow | null;
  if (!order || order.status !== "completed") return;

  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const tierId = typeof meta.tier_id === "string" ? meta.tier_id : null;

  if (order.purpose === "boost_product") {
    const productId = typeof meta.product_id === "string" ? meta.product_id : null;
    if (!productId || !tierId) return;
    const days = BOOST_DURATION_DAYS[tierId] ?? 7;
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("products")
      .update({ boosted: true, boost_tier: tierId, boost_expires_at: expires })
      .eq("id", productId)
      .eq("seller_id", order.user_id);
    await supabaseAdmin.from("notifications").insert([{
      user_id: order.user_id,
      category: "promotions",
      title: "Boost activated 🚀",
      body: `Your product is now boosted for ${days} days.`,
      link: `/product/${productId}`,
    }]);
    return;
  }

  if (order.purpose === "verification") {
    await supabaseAdmin
      .from("profiles")
      .update({ verified: true, verified_tier: tierId, verified_at: new Date().toISOString() })
      .eq("user_id", order.user_id);
    await supabaseAdmin.from("notifications").insert([{
      user_id: order.user_id,
      category: "account",
      title: "Verification active ✅",
      body: "Your account is now verified. Enjoy the perks!",
      link: "/dashboard",
    }]);
  }
}

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) {
          console.error("PAYSTACK_SECRET_KEY not set");
          return new Response("Server misconfigured", { status: 500 });
        }

        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature");
        const hash = createHmac("sha512", secret).update(body).digest("hex");

        if (signature !== hash) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { event: string; data: { reference?: string; status?: string } };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (event.event === "charge.success" && event.data.reference) {
          const reference = event.data.reference;
          try {
            // Always verify server-side
            const result = await verifyTransaction(reference);
            if (result.data) {
              const mapped = mapPaystackStatus(result.data.status);
              await supabaseAdmin
                .from("payment_orders")
                .update({
                  status: mapped,
                  payment_method: result.data.channel ?? null,
                  confirmation_code: result.data.authorization?.authorization_code ?? null,
                  raw_status_response: result as never,
                })
                .eq("merchant_reference", reference);

              if (mapped === "completed") {
                await fulfillBenefits(reference).catch((e) => console.error("fulfillBenefits error:", e));
              }
            }
          } catch (err) {
            console.error("Webhook verify error:", err);
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
