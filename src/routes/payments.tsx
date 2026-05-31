import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { initiatePaystackPayment } from "@/lib/paystack-client";
import { ArrowLeft, BadgeCheck, Check, Crown, Loader2, Rocket, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — Sellora" }] }),
  component: Payments,
});

interface Order {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  payment_method: string | null;
  created_at: string;
}

type Purpose = "boost_product" | "verification" | "subscription";

interface Tier {
  id: string;
  name: string;
  price: number;
  purpose: Purpose;
  description: string;
  benefits: string[];
  highlight?: boolean;
  suffix?: string;
}

const BOOST_TIERS: Tier[] = [
  {
    id: "boost_bronze",
    name: "Bronze Boost",
    price: 300,
    purpose: "boost_product",
    description: "3-day visibility lift",
    benefits: [
      "Top of category for 3 days",
      "Highlighted card border",
      "Up to 2x more views",
      "Boosted in search results",
      "Eligible for daily picks",
      "Email when boost expires",
      "Performance summary report",
    ],
  },
  {
    id: "boost_silver",
    name: "Silver Boost",
    price: 700,
    purpose: "boost_product",
    description: "7-day premium placement",
    highlight: true,
    benefits: [
      "Top of category for 7 days",
      "Featured in homepage feed",
      "Up to 4x more views",
      "Push notifications to nearby buyers",
      "Pinned to seller's shop top",
      "Story-style highlight",
      "Boost badge on product card",
      "Priority in search ranking",
      "Detailed analytics dashboard",
      "Auto-renew option",
    ],
  },
  {
    id: "boost_gold",
    name: "Gold Boost",
    price: 1500,
    purpose: "boost_product",
    description: "14-day max exposure",
    benefits: [
      "Top of category for 14 days",
      "Pinned to homepage hero",
      "Up to 10x more views",
      "Sent in weekly buyer digest",
      "Premium gold ribbon badge",
      "Cross-category recommendations",
      "Featured in push & in-app banners",
      "Smart re-targeting to past viewers",
      "Buyer interest analytics",
      "Dedicated boost manager (24h SLA)",
    ],
  },
];

const VERIFY_TIERS: Tier[] = [
  {
    id: "verify_basic",
    name: "Basic Verified",
    price: 500,
    purpose: "verification",
    description: "Identity confirmed",
    benefits: [
      "Blue verified badge on profile",
      "Higher search trust score",
      "Eligible to list higher-value items",
      "Verified mark in chats",
      "Faster dispute resolution",
      "Access to seller community",
    ],
  },
  {
    id: "verify_pro",
    name: "Pro Verified",
    price: 1500,
    purpose: "verification",
    description: "ID + selfie + phone",
    highlight: true,
    benefits: [
      "All Basic Verified benefits",
      "Gold verified badge",
      "Priority placement in search",
      "Higher daily listing cap",
      "Buyer protection eligibility",
      "Direct customer support line",
      "Featured in 'Trusted Sellers' section",
      "Lower commission rates",
      "Custom shop URL",
    ],
  },
  {
    id: "verify_business",
    name: "Business Verified",
    price: 5000,
    purpose: "verification",
    description: "Registered business",
    benefits: [
      "All Pro Verified benefits",
      "Diamond business badge",
      "Verified business logo display",
      "Bulk listing tools",
      "Multi-staff shop access",
      "API access for inventory sync",
      "Dedicated account manager",
      "Premium analytics & exports",
      "Featured business spotlight",
      "Co-marketing opportunities",
    ],
  },
];

function Payments() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"boost" | "verify">("boost");
  const [profile, setProfile] = useState<{ display_name: string | null; country: string | null } | null>(null);
  const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("payment_orders")
      .select("id,amount,currency,description,status,payment_method,created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setOrders((data as Order[]) || []));
    supabase
      .from("profiles")
      .select("display_name,country")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null));
    supabase
      .from("products")
      .select("id,title")
      .eq("seller_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .then(({ data }) => setProducts((data as { id: string; title: string }[]) ?? []));
  }, [user]);

  const profileComplete = !!profile?.display_name && !!profile?.country;

  const pay = async (tier: Tier) => {
    if (!user) return;
    if (!profileComplete) {
      toast.error("Complete your profile first (name + verified location).");
      navigate({ to: "/onboarding" });
      return;
    }
    if (tier.purpose === "boost_product" && !selectedProductId) {
      toast.error("Choose which product to boost first.");
      return;
    }
    setBusy(tier.id);
    try {
      const { authorization_url } = await initiatePaystackPayment({
        amount: tier.price,
        currency: "KES",
        description: `Sellora — ${tier.name}`,
        purpose: tier.purpose,
        metadata: {
          tier_id: tier.id,
          tier_name: tier.name,
          ...(tier.purpose === "boost_product" ? { product_id: selectedProductId } : {}),
        },
        email: user.email || undefined,
      });
      window.location.href = authorization_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start payment");
      setBusy(null);
    }
  };

  const tiers = tab === "boost" ? BOOST_TIERS : VERIFY_TIERS;

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Payments</h1>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Boost products or get verified. M-Pesa, card, or bank via Paystack.</p>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        <button
          onClick={() => setTab("boost")}
          className={`flex items-center justify-center gap-1 rounded-md py-2 text-sm font-medium ${tab === "boost" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <Rocket className="h-4 w-4" /> Boost
        </button>
        <button
          onClick={() => setTab("verify")}
          className={`flex items-center justify-center gap-1 rounded-md py-2 text-sm font-medium ${tab === "verify" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <BadgeCheck className="h-4 w-4" /> Verify
        </button>
      </div>

      {!profileComplete && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-semibold">Complete your profile first</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Sellora requires your name and a GPS-verified country before any payment can be made.
          </p>
          <button
            onClick={() => navigate({ to: "/onboarding" })}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Complete profile
          </button>
        </div>
      )}

      {tab === "boost" && profileComplete && (
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <p className="mb-1 text-sm font-semibold">Choose product to boost <span className="text-primary">*</span></p>
          {products.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              You have no active products yet.{" "}
              <Link to="/sell" className="text-primary underline">List one first</Link>.
            </div>
          ) : (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
              required
            >
              <option value="">— Select a product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="space-y-3">
        {tiers.map((t) => (
          <TierCard
            key={t.id}
            tier={t}
            loading={busy === t.id}
            disabled={!profileComplete || (t.purpose === "boost_product" && (products.length === 0 || !selectedProductId))}
            onPay={() => pay(t)}
          />
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-muted-foreground">RECENT PAYMENTS</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {orders.map((o, i) => (
            <li key={o.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <Wallet className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{o.description}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString()} · {o.payment_method || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{o.currency} {Number(o.amount).toLocaleString()}</p>
                <StatusPill status={o.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        <Link to="/settings" className="underline">Settings</Link>
      </p>
    </AppLayout>
  );
}

function TierCard({ tier, loading, onPay, disabled }: { tier: Tier; loading: boolean; onPay: () => void; disabled?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${tier.highlight ? "border-primary shadow-[var(--shadow-elegant)]" : "border-border"}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold">{tier.name}</p>
            {tier.highlight && (
              <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                <Zap className="h-3 w-3" /> POPULAR
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{tier.description}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">KES {tier.price.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">{tier.suffix || ""}</span></p>
        </div>
      </div>
      <ul className="mb-3 space-y-1">
        {tier.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2 text-xs">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        disabled={loading || disabled}
        onClick={onPay}
        className="flex h-10 w-full items-center justify-center gap-1 rounded-md bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tier.purpose === "boost_product" ? <Rocket className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
        {loading ? "Starting…" : `Pay KES ${tier.price.toLocaleString()}`}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    cancelled: "bg-muted text-muted-foreground",
    reversed: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  };
  return (
    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
