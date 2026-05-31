import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { initializeTransaction } from "@/lib/paystack.server";
import type { Database } from "@/integrations/supabase/types";

interface InitiateBody {
  amount: number;
  currency?: string;
  description: string;
  purpose?: "boost_product" | "verification" | "subscription" | "other";
  metadata?: Record<string, unknown>;
  phone?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export const Route = createFileRoute("/api/paystack/initiate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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

          const body = (await request.json()) as InitiateBody;
          if (!body.amount || body.amount <= 0 || !body.description) {
            return Response.json({ error: "Invalid amount or description" }, { status: 400 });
          }
          if (body.amount > 1_000_000) {
            return Response.json({ error: "Amount too large" }, { status: 400 });
          }

          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("display_name,country")
            .eq("user_id", userId)
            .maybeSingle();
          if (!prof?.display_name || !prof?.country) {
            return Response.json(
              { error: "Please complete your profile (name and verified location) before paying." },
              { status: 400 }
            );
          }

          const origin = new URL(request.url).origin;
          const callbackUrl = `${origin}/payment/return`;
          const merchantReference = `SLR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Paystack amount is in smallest currency unit (cents/kobo)
          const amountInSmallestUnit = Math.round(body.amount * 100);

          const { error: insertErr } = await supabaseAdmin.from("payment_orders").insert({
            user_id: userId,
            merchant_reference: merchantReference,
            amount: body.amount,
            currency: body.currency || "KES",
            description: body.description.slice(0, 200),
            purpose: body.purpose || "other",
            metadata: (body.metadata || {}) as never,
            status: "pending",
          });
          if (insertErr) {
            console.error("payment_orders insert error:", insertErr);
            return Response.json({ error: "Failed to create order" }, { status: 500 });
          }

          const email = body.email || (claims.claims as Record<string, unknown>).email as string || "customer@sellora.app";

          const result = await initializeTransaction({
            email,
            amount: amountInSmallestUnit,
            currency: body.currency || "KES",
            reference: merchantReference,
            callback_url: callbackUrl,
            metadata: {
              user_id: userId,
              purpose: body.purpose || "other",
              ...(body.metadata || {}),
            },
          });

          if (!result.status || !result.data) {
            await supabaseAdmin
              .from("payment_orders")
              .update({ status: "failed", raw_status_response: result as never })
              .eq("merchant_reference", merchantReference);
            console.error("Paystack initialize failed:", result);
            return Response.json({ error: result.message || "Paystack rejected the order." }, { status: 502 });
          }

          await supabaseAdmin
            .from("payment_orders")
            .update({
              paystack_reference: result.data.reference,
              redirect_url: result.data.authorization_url,
            })
            .eq("merchant_reference", merchantReference);

          return Response.json({
            authorization_url: result.data.authorization_url,
            reference: result.data.reference,
          });
        } catch (err) {
          console.error("Paystack initiate error:", err);
          return Response.json({ error: "Server error" }, { status: 500 });
        }
      },
    },
  },
});
