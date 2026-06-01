import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPayout } from "@/lib/paypal.server";
import crypto from "crypto";

export const getWalletSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: wallet } = await supabaseAdmin
      .from("seller_wallets").select("*").eq("seller_id", userId).maybeSingle();
    const { data: txns } = await supabaseAdmin
      .from("wallet_transactions").select("*")
      .eq("seller_id", userId).order("created_at", { ascending: false }).limit(50);
    const { data: withdrawals } = await supabaseAdmin
      .from("withdrawals").select("*")
      .eq("seller_id", userId).order("created_at", { ascending: false }).limit(20);
    const { data: paypal } = await supabaseAdmin
      .from("seller_paypal_accounts").select("payer_email,verified_account,connected_at")
      .eq("seller_id", userId).maybeSingle();
    return {
      wallet: wallet || { available_usd: 0, pending_usd: 0, lifetime_earned_usd: 0, lifetime_withdrawn_usd: 0 },
      transactions: txns || [],
      withdrawals: withdrawals || [],
      paypal: paypal || null,
    };
  });

export const connectPayPalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin.from("seller_paypal_accounts").upsert({
      seller_id: userId,
      payer_email: data.email,
      verified_account: false,
    }, { onConflict: "seller_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amountUsd: number }) =>
    z.object({ amountUsd: z.number().positive().max(10000) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const amt = Number(data.amountUsd.toFixed(2));
    if (amt < 1) throw new Error("Minimum withdrawal is $1.00");

    const { data: paypal } = await supabaseAdmin
      .from("seller_paypal_accounts").select("payer_email").eq("seller_id", userId).maybeSingle();
    if (!paypal?.payer_email) throw new Error("Connect a PayPal email first");

    const { data: wallet } = await supabaseAdmin
      .from("seller_wallets").select("available_usd").eq("seller_id", userId).maybeSingle();
    if (!wallet || Number(wallet.available_usd) < amt)
      throw new Error("Insufficient balance");

    // Deduct first (optimistic), then call PayPal. On failure we refund.
    const newBal = Number((Number(wallet.available_usd) - amt).toFixed(2));
    const { error: updErr } = await supabaseAdmin
      .from("seller_wallets")
      .update({
        available_usd: newBal,
        lifetime_withdrawn_usd: undefined, // updated on success
      })
      .eq("seller_id", userId)
      .gte("available_usd", amt);
    if (updErr) throw new Error(updErr.message);

    const { data: withdrawal, error: wErr } = await supabaseAdmin
      .from("withdrawals").insert({
        seller_id: userId,
        amount_usd: amt,
        recipient_email: paypal.payer_email,
        status: "processing",
      }).select("*").single();
    if (wErr || !withdrawal) throw new Error(wErr?.message || "Withdrawal create failed");

    await supabaseAdmin.from("wallet_transactions").insert({
      seller_id: userId, kind: "withdrawal", amount_usd: -amt,
      balance_after_usd: newBal, withdrawal_id: withdrawal.id,
      description: `Withdrawal to ${paypal.payer_email}`,
    });

    const batchId = `SELLORA_${withdrawal.id.replace(/-/g, "").slice(0, 24)}_${Date.now().toString().slice(-6)}`;
    try {
      const payout = await createPayout({
        batchId,
        recipientEmail: paypal.payer_email,
        amountUsd: amt,
        note: "Sellora seller withdrawal",
      });
      const ppBatchId = payout?.batch_header?.payout_batch_id || batchId;
      await supabaseAdmin.from("withdrawals").update({
        paypal_batch_id: ppBatchId, raw_paypal: payout as any,
      }).eq("id", withdrawal.id);
      return { ok: true, withdrawalId: withdrawal.id, batchId: ppBatchId };
    } catch (e: any) {
      // Refund wallet
      const reason = String(e?.message || "Payout failed");
      await supabaseAdmin.from("seller_wallets").update({
        available_usd: Number((newBal + amt).toFixed(2)),
      }).eq("seller_id", userId);
      await supabaseAdmin.from("withdrawals").update({
        status: "failed", failure_reason: reason,
      }).eq("id", withdrawal.id);
      await supabaseAdmin.from("wallet_transactions").insert({
        seller_id: userId, kind: "adjustment", amount_usd: amt,
        balance_after_usd: Number((newBal + amt).toFixed(2)),
        withdrawal_id: withdrawal.id,
        description: `Refund: payout failed (${reason.slice(0, 80)})`,
      });
      throw new Error(reason);
    }
  });