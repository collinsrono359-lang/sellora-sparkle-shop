import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// One-shot bootstrap for the Sellora Official admin account.
// Idempotent: safe to call multiple times.
// POST /api/public/bootstrap-admin with header x-bootstrap-token = SUPABASE_SERVICE_ROLE_KEY
// (we reuse the service role key as a shared secret so this endpoint is not open to the public).

const ADMIN_EMAIL = "collinsrono359@gmail.com";
const ADMIN_PASSWORD = "Co12923557!";

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-bootstrap-token");
        if (!token || token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          // 1) Find existing user by email
          let userId: string | null = null;
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          if (listErr) throw listErr;
          const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);
          if (existing) {
            userId = existing.id;
            // Make sure password & confirmation are up to date
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password: ADMIN_PASSWORD,
              email_confirm: true,
            });
          } else {
            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email: ADMIN_EMAIL,
              password: ADMIN_PASSWORD,
              email_confirm: true,
              user_metadata: { display_name: "Sellora Official" },
            });
            if (createErr) throw createErr;
            userId = created.user!.id;
          }

          // 2) Ensure admin role
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin.from("user_roles") as any).upsert(
            { user_id: userId, role: "admin" },
            { onConflict: "user_id,role" },
          );

          // 3) Ensure profile flagged as Sellora Official + verified
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin.from("profiles") as any)
            .update({
              display_name: "Sellora Official",
              verified: true,
              verified_at: new Date().toISOString(),
              verified_tier: "official",
              bio: "Official Sellora support & moderation. Contact us for help, appeals, or to report issues.",
            })
            .eq("user_id", userId);

          return Response.json({ ok: true, userId });
        } catch (e) {
          console.error("bootstrap-admin failed", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Bootstrap failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
