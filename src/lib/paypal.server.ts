// PayPal REST API helpers (server-only).

function base(): string {
  const env = (process.env.PAYPAL_ENV || "live").toLowerCase();
  return env === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function paypalAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials not configured");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal oauth failed: ${r.status} ${await r.text()}`);
  const j = await r.json() as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function pp<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await paypalAccessToken();
  const r = await fetch(`${base()}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`PayPal ${path} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : ({} as T);
}

export interface CreateOrderInput {
  amountUsd: number;
  orderId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export async function createPaypalOrder(input: CreateOrderInput) {
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.orderId,
        description: input.description.slice(0, 127),
        amount: { currency_code: "USD", value: input.amountUsd.toFixed(2) },
      },
    ],
    application_context: {
      brand_name: "Sellora",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
  };
  return pp<{ id: string; status: string; links: { rel: string; href: string; method: string }[] }>(
    "/v2/checkout/orders",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function getPaypalOrder(orderId: string) {
  return pp<any>(`/v2/checkout/orders/${orderId}`);
}

export async function capturePaypalOrder(orderId: string) {
  return pp<any>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: "{}" });
}

export async function createPayout(opts: {
  batchId: string;
  recipientEmail: string;
  amountUsd: number;
  note?: string;
}) {
  const body = {
    sender_batch_header: {
      sender_batch_id: opts.batchId,
      email_subject: "You have a payout from Sellora",
      email_message: opts.note || "Your withdrawal has been processed.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: opts.amountUsd.toFixed(2), currency: "USD" },
        receiver: opts.recipientEmail,
        note: opts.note || "Sellora withdrawal",
        sender_item_id: opts.batchId,
      },
    ],
  };
  return pp<any>("/v1/payments/payouts", { method: "POST", body: JSON.stringify(body) });
}

export async function getPayout(batchId: string) {
  return pp<any>(`/v1/payments/payouts/${batchId}`);
}