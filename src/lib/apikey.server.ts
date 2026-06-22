import crypto from "crypto";

// API key format:
//   live: sk_live_<24-char base64url>
//   test: sk_test_<24-char base64url>  (sandbox; no real money moves)
// Prefix stored = first 16 chars (sk_live_xxxxxxxx / sk_test_xxxxxxxx)
export function generateApiKey(mode: "live" | "test" = "live") {
  const rand = crypto.randomBytes(24).toString("base64url");
  const full = `sk_${mode}_${rand}`;
  const prefix = full.slice(0, 16);
  const hash = crypto.createHash("sha256").update(full).digest("hex");
  return { full, prefix, hash };
}

export function hashApiKey(full: string) {
  return crypto.createHash("sha256").update(full).digest("hex");
}

export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function signWebhook(secret: string, payload: string, timestamp: number) {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${sig}`;
}