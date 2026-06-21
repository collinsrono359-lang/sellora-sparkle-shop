import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonErr, jsonOk, withApi } from "@/lib/apiauth.server";

const PATH = "/api/public/v1/users/profile";

export const Route = createFileRoute("/api/public/v1/users/profile")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) =>
        withApi(request, PATH, "read_profile", async (app) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("user_id,display_name,bio,avatar_url,verified,verified_tier,location_country,location_city,created_at")
            .eq("user_id", app.owner_id)
            .maybeSingle();
          if (error) return jsonErr(500, "db_error", error.message);
          return jsonOk({ data });
        }),
    },
  },
});