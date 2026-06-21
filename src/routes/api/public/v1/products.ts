import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

const PATH = "/api/public/v1/products";

export const Route = createFileRoute("/api/public/v1/products")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) =>
        withApi(request, PATH, "read_products", async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
          const q = url.searchParams.get("q");
          let qb = supabaseAdmin
            .from("products")
            .select("id,title,description,price,currency,category,images,seller_id,status,created_at")
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (q) qb = qb.ilike("title", `%${q}%`);
          const { data, error } = await qb;
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data, limit, offset });
        }),
      POST: async ({ request }) =>
        withApi(request, PATH, "write_products", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let body: any;
          try { body = await request.json(); } catch { return jsonErr(400, "invalid_json", "Body must be JSON"); }
          const required = ["title", "price", "currency"];
          for (const k of required) if (!body[k]) return jsonErr(400, "missing_field", `Missing: ${k}`);
          const { data, error } = await supabaseAdmin
            .from("products")
            .insert({
              seller_id: app.owner_id,
              title: String(body.title).slice(0, 200),
              description: body.description ? String(body.description).slice(0, 5000) : null,
              price: Number(body.price),
              currency: String(body.currency).slice(0, 8),
              category: body.category ? String(body.category).slice(0, 80) : null,
              images: Array.isArray(body.images) ? body.images.slice(0, 10) : [],
              status: "active",
            })
            .select("id,title,price,currency,status,created_at")
            .single();
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data }, 201);
        }),
    },
  },
});