// Server-only Paystack helper. NEVER import from client code.

const PAYSTACK_BASE = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${getSecretKey()}`,
    "Content-Type": "application/json",
  };
}

export interface InitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function initializeTransaction(params: {
  email: string;
  amount: number; // in kobo (smallest currency unit)
  currency?: string;
  reference: string;
  callback_url: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email: params.email,
      amount: params.amount,
      currency: params.currency || "KES",
      reference: params.reference,
      callback_url: params.callback_url,
      metadata: params.metadata || {},
    }),
  });
  return (await res.json()) as InitializeResponse;
}

export interface VerifyResponse {
  status: boolean;
  message: string;
  data?: {
    id: number;
    status: string; // "success" | "failed" | "abandoned" | "reversed"
    reference: string;
    amount: number;
    currency: string;
    channel: string; // "card" | "bank" | "mobile_money" | etc
    paid_at: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
    gateway_response: string;
    authorization?: {
      authorization_code: string;
      card_type: string;
      last4: string;
      bank: string;
    };
  };
}

export async function verifyTransaction(reference: string): Promise<VerifyResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: headers(),
  });
  return (await res.json()) as VerifyResponse;
}

export function mapPaystackStatus(
  status: string
): "pending" | "completed" | "failed" | "cancelled" | "reversed" {
  switch (status) {
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "abandoned":
      return "cancelled";
    case "reversed":
      return "reversed";
    default:
      return "pending";
  }
}
