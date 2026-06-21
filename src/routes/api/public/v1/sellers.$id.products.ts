import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

export const Route = createFileRoute("/api/public/v1/sellers/$id/products")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request, params }) =>
        withApi(request, `/api/public/v1/sellers/${params.id}/products`, "read_products", async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
          const { data, error } = await supabaseAdmin
            .from("products")
            .select("id,title,price,currency,photos,status,created_at")
            .eq("seller_id", params.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data, limit, offset });
        }),
    },
  },
});