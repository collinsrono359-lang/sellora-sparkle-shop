import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

export const Route = createFileRoute("/api/public/v1/orders/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request, params }) =>
        withApi(request, `/api/public/v1/orders/${params.id}`, "read_orders", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("orders").select("*").eq("id", params.id).maybeSingle();
          if (error) return jsonErr(500, "db_error", error.message);
          if (!data) return jsonErr(404, "not_found", "Order not found");
          if (data.buyer_id !== app.owner_id && data.seller_id !== app.owner_id) {
            return jsonErr(403, "forbidden", "App does not have access to this order");
          }
          return jsonOk({ data });
        }),
    },
  },
});