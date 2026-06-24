import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const [profile, products, orders, messages, flags, appeals, wallet, txns] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("products").select("*").eq("seller_id", uid),
      supabaseAdmin.from("orders").select("*").or(`buyer_id.eq.${uid},seller_id.eq.${uid}`),
      supabaseAdmin.from("messages").select("*").or(`sender_id.eq.${uid},recipient_id.eq.${uid}`),
      supabaseAdmin.from("moderation_flags").select("*").eq("user_id", uid),
      supabaseAdmin.from("moderation_appeals").select("*").eq("user_id", uid),
      supabaseAdmin.from("seller_wallets").select("*").eq("seller_id", uid).maybeSingle(),
      supabaseAdmin.from("wallet_transactions").select("*").eq("seller_id", uid),
    ]);
    return {
      exported_at: new Date().toISOString(),
      user_id: uid,
      profile: profile.data,
      products: products.data ?? [],
      orders: orders.data ?? [],
      messages: messages.data ?? [],
      moderation_flags: flags.data ?? [],
      moderation_appeals: appeals.data ?? [],
      wallet: wallet.data,
      wallet_transactions: txns.data ?? [],
    };
  });

const ConfirmInput = z.object({ confirm: z.literal("DELETE") });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    // best-effort scrub of user-owned rows
    await supabaseAdmin.from("products").delete().eq("seller_id", uid);
    await supabaseAdmin.from("messages").delete().or(`sender_id.eq.${uid},recipient_id.eq.${uid}`);
    await supabaseAdmin.from("favorites").delete().eq("user_id", uid);
    await supabaseAdmin.from("device_fingerprints").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_preferences").delete().eq("user_id", uid);
    await supabaseAdmin.from("notifications").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("user_id", uid);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const IpInput = z.object({
  ip: z.string().min(3).max(64),
  reason: z.string().min(3).max(200),
  category: z.enum(["auto_browse", "vpn_proxy", "scrape", "hack_attempt", "restricted_feature", "other"]),
  minutes: z.number().int().min(1).max(60 * 24 * 30).default(5),
});

export const reportSuspiciousIp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IpInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const until = new Date(Date.now() + data.minutes * 60 * 1000).toISOString();
    await supabaseAdmin.from("blocked_ips").insert({
      ip: data.ip,
      reason: data.reason,
      category: data.category,
      blocked_until: until,
    });
    return { blocked_until: until };
  });

const CheckInput = z.object({ ip: z.string().min(3).max(64) });

export const checkIpBlock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CheckInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("blocked_ips")
      .select("reason,category,blocked_until,permanent")
      .eq("ip", data.ip)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { blocked: false };
    const r = row as { reason: string; category: string; blocked_until: string | null; permanent: boolean };
    if (r.permanent) return { blocked: true, ...r };
    if (r.blocked_until && new Date(r.blocked_until) > new Date()) return { blocked: true, ...r };
    return { blocked: false };
  });