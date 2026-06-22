// Helper used inside server route handlers under /api/public/v1/*
import { hashApiKey } from "./apikey.server";

export interface AuthedApp {
  id: string;
  owner_id: string;
  name: string;
  scopes: string[];
  platform_fee_pct: number;
  rate_limit_per_min: number;
  active: boolean;
  mode: "live" | "test";
}

export async function authenticateApiRequest(request: Request): Promise<
  { app: AuthedApp } | { error: Response }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { error: jsonErr(401, "missing_authorization", "Provide Authorization: Bearer sk_...") };
  }
  const token = auth.slice(7).trim();
  if (!token.startsWith("sk_live_") && !token.startsWith("sk_test_")) {
    return { error: jsonErr(401, "invalid_key_format", "API key must start with sk_live_ or sk_test_") };
  }
  const keyHash = hashApiKey(token);
  const { data, error } = await supabaseAdmin
    .from("developer_apps")
    .select("id,owner_id,name,scopes,platform_fee_pct,rate_limit_per_min,active,mode")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error || !data) return { error: jsonErr(401, "invalid_key", "Unknown API key") };
  if (!data.active) return { error: jsonErr(403, "key_disabled", "API key is disabled") };

  // Touch last_used_at (best-effort)
  void supabaseAdmin
    .from("developer_apps")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { app: data as AuthedApp };
}

export function requireScope(app: AuthedApp, scope: string) {
  if (!app.scopes.includes(scope) && !app.scopes.includes("*")) {
    return jsonErr(403, "missing_scope", `This API key is missing required scope: ${scope}`);
  }
  return null;
}

export function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function jsonErr(status: number, code: string, message: string) {
  return jsonOk({ error: { code, message } }, status);
}

export async function logApiRequest(opts: {
  appId?: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  ip?: string | null;
  userAgent?: string | null;
  error?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("api_request_logs").insert({
      app_id: opts.appId || null,
      method: opts.method,
      path: opts.path,
      status_code: opts.status,
      latency_ms: opts.latencyMs,
      ip: opts.ip || null,
      user_agent: opts.userAgent || null,
      error: opts.error || null,
    });
  } catch { /* ignore */ }
}

export async function withApi(
  request: Request,
  path: string,
  scope: string,
  fn: (app: AuthedApp) => Promise<Response>,
) {
  const t0 = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = request.headers.get("user-agent");
  const auth = await authenticateApiRequest(request);
  if ("error" in auth) {
    await logApiRequest({
      method: request.method, path, status: auth.error.status,
      latencyMs: Date.now() - t0, ip, userAgent: ua, error: "auth failed",
    });
    return auth.error;
  }
  const scopeErr = requireScope(auth.app, scope);
  if (scopeErr) {
    await logApiRequest({
      appId: auth.app.id, method: request.method, path, status: 403,
      latencyMs: Date.now() - t0, ip, userAgent: ua, error: "missing scope",
    });
    return scopeErr;
  }
  try {
    const res = await fn(auth.app);
    await logApiRequest({
      appId: auth.app.id, method: request.method, path, status: res.status,
      latencyMs: Date.now() - t0, ip, userAgent: ua,
    });
    return res;
  } catch (e: any) {
    await logApiRequest({
      appId: auth.app.id, method: request.method, path, status: 500,
      latencyMs: Date.now() - t0, ip, userAgent: ua, error: String(e?.message || e).slice(0, 500),
    });
    return jsonErr(500, "internal_error", String(e?.message || "Internal error"));
  }
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}