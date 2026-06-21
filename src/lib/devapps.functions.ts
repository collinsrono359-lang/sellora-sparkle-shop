import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDevApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("developer_apps")
      .select("id,name,description,website,key_prefix,scopes,platform_fee_pct,rate_limit_per_min,active,last_used_at,created_at")
      .order("created_at", { ascending: false });
    return { apps: data || [] };
  });

export const createDevApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string; website?: string; scopes?: string[]; platform_fee_pct?: number }) =>
    z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(500).optional(),
      website: z.string().url().max(200).optional().or(z.literal("")),
      scopes: z.array(z.string()).max(20).optional(),
      platform_fee_pct: z.number().min(0).max(0.5).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateApiKey } = await import("@/lib/apikey.server");
    const key = generateApiKey();
    const { data: app, error } = await supabaseAdmin
      .from("developer_apps")
      .insert({
        owner_id: userId,
        name: data.name,
        description: data.description || null,
        website: data.website || null,
        scopes: data.scopes && data.scopes.length ? data.scopes : ["read_products", "read_profile", "read_orders"],
        platform_fee_pct: data.platform_fee_pct ?? 0.10,
        key_prefix: key.prefix,
        key_hash: key.hash,
      })
      .select("id,name,key_prefix")
      .single();
    if (error || !app) throw new Error(error?.message || "Create failed");
    // Return the secret ONCE — never stored or shown again.
    return { app, secret: key.full };
  });

export const rotateDevApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateApiKey } = await import("@/lib/apikey.server");
    const { data: existing } = await supabaseAdmin.from("developer_apps").select("owner_id").eq("id", data.id).maybeSingle();
    if (!existing || existing.owner_id !== userId) throw new Error("Not found");
    const key = generateApiKey();
    const { error } = await supabaseAdmin
      .from("developer_apps")
      .update({ key_prefix: key.prefix, key_hash: key.hash })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { secret: key.full, key_prefix: key.prefix };
  });

export const updateDevApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active?: boolean; scopes?: string[]; platform_fee_pct?: number; name?: string; description?: string; website?: string }) =>
    z.object({
      id: z.string().uuid(),
      active: z.boolean().optional(),
      scopes: z.array(z.string()).max(20).optional(),
      platform_fee_pct: z.number().min(0).max(0.5).optional(),
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(500).optional(),
      website: z.string().url().max(200).optional().or(z.literal("")).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      active?: boolean; scopes?: string[]; platform_fee_pct?: number;
      name?: string; description?: string | null; website?: string | null;
    } = {};
    if (data.active !== undefined) patch.active = data.active;
    if (data.scopes !== undefined) patch.scopes = data.scopes;
    if (data.platform_fee_pct !== undefined) patch.platform_fee_pct = data.platform_fee_pct;
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.website !== undefined) patch.website = data.website || null;
    const { error } = await supabase.from("developer_apps").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDevApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("developer_apps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { appId: string }) => z.object({ appId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("webhook_endpoints")
      .select("id,url,events,active,secret,created_at")
      .eq("app_id", data.appId)
      .order("created_at", { ascending: false });
    return { endpoints: rows || [] };
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { appId: string; url: string; events?: string[] }) =>
    z.object({
      appId: z.string().uuid(),
      url: z.string().url().max(500),
      events: z.array(z.string()).max(50).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateWebhookSecret } = await import("@/lib/apikey.server");
    const { data: app } = await supabaseAdmin.from("developer_apps").select("owner_id").eq("id", data.appId).maybeSingle();
    if (!app || app.owner_id !== userId) throw new Error("App not found");
    const { data: ep, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .insert({
        app_id: data.appId,
        url: data.url,
        events: data.events && data.events.length ? data.events : ["*"],
        secret: generateWebhookSecret(),
      })
      .select("id,url,events,secret,active")
      .single();
    if (error || !ep) throw new Error(error?.message || "Create failed");
    return { endpoint: ep };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { appId: string }) => z.object({ appId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: eps } = await supabase.from("webhook_endpoints").select("id").eq("app_id", data.appId);
    const ids = (eps || []).map((e) => e.id);
    if (!ids.length) return { deliveries: [] };
    const { data: rows } = await supabase
      .from("webhook_deliveries")
      .select("id,event_type,status,attempts,last_status_code,last_error,delivered_at,created_at,endpoint_id")
      .in("endpoint_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);
    return { deliveries: rows || [] };
  });

export const listRecentApiLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { appId: string }) => z.object({ appId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("api_request_logs")
      .select("id,method,path,status_code,latency_ms,error,created_at")
      .eq("app_id", data.appId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { logs: rows || [] };
  });