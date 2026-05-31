import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface AppealVerdict {
  recommendation: "approve" | "reject" | "uncertain";
  confidence: "low" | "medium" | "high";
  reason: string;
  was_mistake: boolean;
}

async function callGroqForAppeal(payload: unknown): Promise<AppealVerdict | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are an impartial reviewer of moderation appeals on a marketplace app (Sellora).
You are given:
- the original flag (what the moderator/AI thought was wrong)
- the user's appeal message (their explanation)
- the user's history (warning_count, prior flags, suspended_until)
- recent moderation events from this user (their actual recent activity as SENDER)

Your job is to decide if the suspension/flag was a MISTAKE. Be skeptical but fair.

Rules:
- "approve" = the flag looks like a false positive (e.g. buyer warned about a scammer and got flagged as scam; legitimate question; no recent abuse evidence).
- "reject" = the user clearly did something wrong (scam listings, spam, harassment, illegal content) AND the appeal doesn't credibly refute it.
- "uncertain" = not enough info either way.
- Only set confidence="high" when the evidence is overwhelming.
- Set was_mistake=true ONLY when recommendation="approve" AND confidence="high".
- Examine the recent moderation events: if the user was clearly the bad actor (sent spam/scam/harassing content), do NOT approve regardless of how convincing the appeal sounds.

Respond ONLY in JSON: {"recommendation":"approve|reject|uncertain","confidence":"low|medium|high","reason":"2-3 sentence explanation for the admin","was_mistake":true|false}`,
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    console.error("Groq appeal error", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as AppealVerdict;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/review-appeal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("Authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) return new Response("Unauthorized", { status: 401 });

          const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

          // Verify caller is admin/moderator
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id);
          const isAdmin = (roles ?? []).some(
            (r) => r.role === "admin" || r.role === "moderator",
          );
          if (!isAdmin) return new Response("Forbidden", { status: 403 });

          const body = (await request.json()) as { appealId?: string; autoApprove?: boolean };
          if (!body.appealId) {
            return new Response("appealId required", { status: 400 });
          }

          // Load appeal + related context
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: appeal } = await (supabaseAdmin.from("moderation_appeals" as any) as any)
            .select("*")
            .eq("id", body.appealId)
            .maybeSingle();
          if (!appeal) return new Response("Appeal not found", { status: 404 });

          const subjectId = appeal.user_id as string;

          const [flagRes, profRes, eventsRes, priorFlagsRes] = await Promise.all([
            appeal.flag_id
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabaseAdmin.from("moderation_flags" as any) as any)
                  .select("*")
                  .eq("id", appeal.flag_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabaseAdmin
              .from("profiles")
              .select("display_name, warning_count, suspended_until, permanent_ban, ban_reason, created_at")
              .eq("user_id", subjectId)
              .maybeSingle(),
            supabaseAdmin
              .from("moderation_events" as never)
              .select("event_type, content, created_at, metadata")
              .eq("user_id", subjectId)
              .order("created_at", { ascending: false })
              .limit(30),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabaseAdmin.from("moderation_flags" as any) as any)
              .select("severity, category, reason, created_at")
              .eq("user_id", subjectId)
              .order("created_at", { ascending: false })
              .limit(10),
          ]);

          const payload = {
            appeal: {
              message: appeal.message,
              full_name: appeal.full_name,
              is_critical: appeal.is_critical,
              created_at: appeal.created_at,
            },
            original_flag: flagRes?.data ?? null,
            user_profile: profRes?.data ?? null,
            recent_activity_by_this_user: (eventsRes?.data ?? []).map((e: { event_type: string; content: string | null; created_at: string; metadata: Record<string, unknown> }) => ({
              type: e.event_type,
              text: e.content?.slice(0, 400) ?? null,
              at: e.created_at,
            })),
            prior_flags: priorFlagsRes?.data ?? [],
          };

          const verdict = await callGroqForAppeal(payload);

          // Auto-approve when requested + AI is confident it was a mistake
          let autoApplied = false;
          if (body.autoApprove && verdict?.was_mistake) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabaseAdmin.from("moderation_appeals" as any) as any)
              .update({
                status: "approved",
                admin_response:
                  `Auto-approved after AI review: ${verdict.reason}`,
                reviewed_by: userData.user.id,
              })
              .eq("id", body.appealId);
            autoApplied = true;
          }

          return Response.json({ ok: true, verdict, autoApplied });
        } catch (e) {
          console.error("review-appeal error", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Review failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
