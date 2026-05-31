import { supabase } from "@/integrations/supabase/client";

export interface InitiatePaymentInput {
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

export async function initiatePaystackPayment(input: InitiatePaymentInput) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("You must be signed in to pay");

  let res: Response;
  try {
    res = await fetch("/api/paystack/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  let data: { authorization_url?: string; reference?: string; error?: string; details?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(`Payment service unavailable (HTTP ${res.status}). Please try again shortly.`);
  }

  if (!res.ok || !data.authorization_url) {
    const detail = typeof data.details === "object" && data.details
      ? ` (${JSON.stringify(data.details).slice(0, 200)})`
      : "";
    throw new Error((data.error || `Failed to start payment (HTTP ${res.status})`) + detail);
  }
  return data as { authorization_url: string; reference: string };
}

export async function verifyPaystackPayment(reference: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("You must be signed in");

  const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json()) as {
    status: "pending" | "completed" | "failed" | "cancelled" | "reversed";
    order?: Record<string, unknown>;
    error?: string;
  };
}
