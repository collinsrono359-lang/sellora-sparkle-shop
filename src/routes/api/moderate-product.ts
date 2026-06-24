import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectBanned } from "@/lib/banned-items";

interface AIVerdict {
  verdict: "ok" | "violation";
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  reason: string;
}

async function callGroq(title: string, description: string, category: string): Promise<AIVerdict | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are a strict marketplace listing moderator for Sellora. Decide if the listing violates terms.

VIOLATIONS (verdict: "violation"):
- Illegal drugs, narcotics, controlled substances
- Weapons, firearms, ammunition, explosives
- Counterfeit goods, fake IDs, stolen items, credit-card fraud / carding
- Wildlife trade (ivory, rhino horn, pangolin, shark fin)
- Adult/sexual content, escort services, human trafficking, CSAM
- Human body parts/organs
- Hate symbols or extremist propaganda
- Hacking services, malware, phishing kits
- Obviously fraudulent listings (e.g. "get rich quick", "free money", impossible prices like new iPhone $5)

Legitimate goods (electronics, fashion, furniture, books, vehicles, services, food, etc.) are "ok" even if niche.

Respond ONLY in JSON: {"verdict":"ok|violation","severity":"low|medium|high|critical","category":"drugs|weapons|counterfeit|wildlife|adult|organs|hate|hacking|fraud|other","reason":"short user-facing reason"}.`,
        },
        { role: "user", content: JSON.stringify({ title, description, category }) },
      ],
    }),
  });
  if (!res.ok) { console.error("Groq error", res.status); return null; }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try { return JSON.parse(content) as AIVerdict; } catch { return null; }
}

export const Route = createFileRoute("/api/moderate-product")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("Authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) return new Response("Unauthorized", { status: 401 });
          const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
          const userId = userData.user.id;

          const body = await request.json() as { productId?: string };
          if (!body.productId) return new Response(JSON.stringify({ error: "missing productId" }), { status: 400 });

          const { data: product } = await supabaseAdmin
            .from("products")
            .select("id,title,description,category,seller_id")
            .eq("id", body.productId)
            .maybeSingle();
          if (!product || product.seller_id !== userId) {
            return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
          }

          // Fast keyword check first
          const text = `${product.title}\n${product.description ?? ""}`;
          const bannedHit = detectBanned(text);

          let verdict: AIVerdict | null = null;
          if (bannedHit) {
            verdict = {
              verdict: "violation",
              severity: "critical",
              category: "other",
              reason: `Listing contains prohibited keyword: "${bannedHit}".`,
            };
          } else {
            verdict = await callGroq(product.title, product.description ?? "", product.category ?? "");
          }

          if (!verdict || verdict.verdict === "ok") {
            return Response.json({ ok: true, verdict: verdict ?? { verdict: "ok" } });
          }

          // VIOLATION → remove product, PERMANENTLY ban seller, notify
          const until = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin
            .from("products")
            .update({ status: "removed" } as never)
            .eq("id", product.id);

          await supabaseAdmin.from("moderation_flags" as never).insert({
            user_id: userId,
            severity: verdict.severity,
            category: verdict.category,
            reason: `Product violation: ${verdict.reason}`,
            ai_verdict: verdict as unknown as Record<string, unknown>,
          } as never);

          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("warning_count")
            .eq("user_id", userId)
            .maybeSingle();

          await (supabaseAdmin.from("profiles") as never as { update: (v: unknown) => { eq: (a: string, b: string) => Promise<unknown> } })
            .update({
              suspended_until: until,
              permanent_ban: true,
              ban_reason: `Permanent ban — prohibited listing: ${verdict.reason}`,
              warning_count: ((prof as { warning_count?: number } | null)?.warning_count ?? 0) + 1,
            })
            .eq("user_id", userId);

          await supabaseAdmin.from("notifications" as never).insert({
            user_id: userId,
            category: "system",
            title: "Account permanently suspended",
            body: `Your listing "${product.title}" violates our terms (${verdict.category}). ${verdict.reason} This is a permanent ban — you may request a data export, delete your account, or file an appeal.`,
            link: "/settings",
            read: false,
          } as never);

          return Response.json({ ok: false, suspended: true, verdict });
        } catch (e) {
          console.error("moderate-product error", e);
          return new Response(JSON.stringify({ error: "moderation failed" }), { status: 500 });
        }
      },
    },
  },
});