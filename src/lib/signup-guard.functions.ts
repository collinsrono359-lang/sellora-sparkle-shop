import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  email: z.string().email(),
  fingerprint: z.string().min(1),
  ip: z.string().nullable().optional(),
});

const MAX_ACCOUNTS_PER_DEVICE = 2;
const REJECTION_WARNING_THRESHOLD = 3;

export const checkSignupAllowed = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { email, fingerprint, ip } = data;

    // Count distinct existing user accounts that have used this fingerprint or IP.
    const { data: fpRows } = await supabaseAdmin
      .from("device_fingerprints")
      .select("user_id")
      .or(`fingerprint.eq.${fingerprint}${ip ? `,ip.eq.${ip}` : ""}`);
    const distinctUsers = new Set((fpRows ?? []).map((r) => r.user_id).filter(Boolean));

    // Also count successful prior signups from the same device (covers users who never logged a fingerprint row).
    const { data: successRows } = await supabaseAdmin
      .from("signup_attempts")
      .select("user_id")
      .eq("status", "success")
      .or(`fingerprint.eq.${fingerprint}${ip ? `,ip.eq.${ip}` : ""}`);
    for (const r of successRows ?? []) if (r.user_id) distinctUsers.add(r.user_id);

    const accountCount = distinctUsers.size;

    if (accountCount >= MAX_ACCOUNTS_PER_DEVICE) {
      // Count prior rejections in last 24h to decide warning level.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: rejectedCount } = await supabaseAdmin
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected")
        .gte("created_at", since)
        .or(`fingerprint.eq.${fingerprint}${ip ? `,ip.eq.${ip}` : ""}`);

      await supabaseAdmin.from("signup_attempts").insert({
        fingerprint,
        ip: ip ?? null,
        email,
        status: "rejected",
        reason: "device_limit",
      });

      const totalRejections = (rejectedCount ?? 0) + 1;
      const harshWarning = totalRejections >= REJECTION_WARNING_THRESHOLD;

      return {
        allowed: false,
        forceLogin: true,
        warning: harshWarning,
        message: harshWarning
          ? "Too many signup attempts from this device. Repeated abuse may lead to a permanent ban. Please sign in instead."
          : `This device already has ${accountCount} accounts (limit ${MAX_ACCOUNTS_PER_DEVICE}). Please sign in to an existing account.`,
        accountCount,
      };
    }

    await supabaseAdmin.from("signup_attempts").insert({
      fingerprint,
      ip: ip ?? null,
      email,
      status: "attempt",
    });

    return { allowed: true, forceLogin: false, warning: false, message: "ok", accountCount };
  });

const RecordInput = z.object({
  email: z.string().email(),
  fingerprint: z.string().min(1),
  ip: z.string().nullable().optional(),
  userId: z.string().uuid(),
});

export const recordSignupSuccess = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("signup_attempts").insert({
      fingerprint: data.fingerprint,
      ip: data.ip ?? null,
      email: data.email,
      status: "success",
      user_id: data.userId,
    });
    return { ok: true };
  });
