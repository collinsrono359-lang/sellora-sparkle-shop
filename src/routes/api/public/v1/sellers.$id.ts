import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

export const Route = createFileRoute("/api/public/v1/sellers/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request, params }) =>
        withApi(request, `/api/public/v1/sellers/${params.id}`, "read_profile", async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("user_id,display_name,bio,avatar_url,verified,verified_tier,location_country,location_city,created_at")
            .eq("user_id", params.id)
            .maybeSingle();
          if (error) return jsonErr(500, "db_error", error.message);
          if (!data) return jsonErr(404, "not_found", "Seller not found");
          return jsonOk({ data });
        }),
    },
  },
});