import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

export const Route = createFileRoute("/api/public/v1/products/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request, params }) =>
        withApi(request, `/api/public/v1/products/${params.id}`, "read_products", async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("products")
            .select("id,title,description,price,currency,category,condition,photos,seller_id,status,location,shipping_available,views,created_at")
            .eq("id", params.id)
            .maybeSingle();
          if (error) return jsonErr(500, "db_error", error.message);
          if (!data) return jsonErr(404, "not_found", "Product not found");
          return jsonOk({ data });
        }),
      PUT: async ({ request, params }) =>
        withApi(request, `/api/public/v1/products/${params.id}`, "write_products", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let body: any;
          try { body = await request.json(); } catch { return jsonErr(400, "invalid_json", "Body must be JSON"); }
          const patch: Record<string, unknown> = {};
          for (const k of ["title", "description", "price", "currency", "category", "condition", "photos", "status", "location", "shipping_available"]) {
            if (body[k] !== undefined) patch[k] = body[k];
          }
          const { data, error } = await supabaseAdmin
            .from("products")
            .update(patch as never)
            .eq("id", params.id)
            .eq("seller_id", app.owner_id)
            .select("id")
            .maybeSingle();
          if (error) return jsonErr(500, "db_error", error.message);
          if (!data) return jsonErr(404, "not_found", "Product not found or not owned by app");
          return jsonOk({ data });
        }),
      DELETE: async ({ request, params }) =>
        withApi(request, `/api/public/v1/products/${params.id}`, "write_products", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error, count } = await supabaseAdmin
            .from("products")
            .delete({ count: "exact" })
            .eq("id", params.id)
            .eq("seller_id", app.owner_id);
          if (error) return jsonErr(500, "db_error", error.message);
          if (!count) return jsonErr(404, "not_found", "Product not found or not owned by app");
          return jsonOk({ deleted: true });
        }),
    },
  },
});