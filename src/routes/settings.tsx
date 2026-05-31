import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ArrowLeft, BadgeCheck, Bell, ChevronRight, CreditCard, FileText, Gift, Globe, HelpCircle, Languages, LogOut, Moon, Lock, MessageSquare, ScrollText, ShieldAlert, ShieldCheck, Star, Store, TriangleAlert, UserPen, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Sellora" }] }),
  component: Settings,
});

interface Item { label: string; sub?: string; Icon: React.ComponentType<{ className?: string }>; to?: string }

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "ACCOUNT",
    items: [
      { label: "Edit Profile", Icon: UserPen, to: "/onboarding" },
      { label: "Identity Verification (KYC)", sub: "Submit ID for verified badge", Icon: BadgeCheck, to: "/kyc" },
      { label: "Notifications", Icon: Bell, to: "/notifications" },
      { label: "Privacy Settings", Icon: Lock, to: "/privacy" },
      { label: "Invite Friends", sub: "Share Sellora with your network", Icon: Gift, to: "/invite" },
    ],
  },
  {
    title: "SELLING",
    items: [
      { label: "Start Selling", sub: "List your first product!", Icon: Store, to: "/sell" },
      { label: "Payments & Boosts", sub: "Pay via M-Pesa, card, or bank", Icon: CreditCard, to: "/payments" },
      { label: "Payment Settings", sub: "Payout method & history", Icon: Wallet, to: "/payments" },
      { label: "Verification & Boost", sub: "Get verified, boost listings", Icon: ShieldCheck, to: "/payments" },
    ],
  },
  {
    title: "PREFERENCES",
    items: [
      { label: "Language", sub: "English", Icon: Languages, to: "/preferences" },
      { label: "Region & Currency", sub: "Kenya (KES)", Icon: Globe, to: "/preferences" },
      { label: "Appearance", sub: "Light / Dark / System", Icon: Moon, to: "/preferences" },
      { label: "Saved Searches", Icon: Star, to: "/saved" },
    ],
  },
  {
    title: "SUPPORT",
    items: [
      { label: "Help Center", Icon: HelpCircle, to: "/help" },
      { label: "Contact Support", Icon: MessageSquare, to: "/contact" },
      { label: "Rate Sellora", Icon: Star, to: "/help" },
    ],
  },
  {
    title: "LEGAL & SAFETY",
    items: [
      { label: "Terms of Service", Icon: ScrollText, to: "/legal/terms" },
      { label: "Buyer Guidelines", Icon: FileText, to: "/legal/buyer" },
      { label: "Seller Guidelines", Icon: FileText, to: "/legal/seller" },
      { label: "Community Standards", Icon: TriangleAlert, to: "/legal/community" },
      { label: "Safety Tips", Icon: ShieldAlert, to: "/legal/safety" },
      { label: "Privacy Policy", Icon: FileText, to: "/legal/privacy" },
      { label: "Report a Problem", Icon: TriangleAlert, to: "/report" },
    ],
  },
];

function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/dashboard" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {user && (
        <div className="mb-5 rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="text-sm font-semibold">{user.email}</p>
        </div>
      )}

      {SECTIONS.map((s) => (
        <section key={s.title} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{s.title}</h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {s.items.map((it, i) => {
              const Inner = (
                <>
                  <it.Icon className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{it.label}</p>
                    {it.sub && <p className="text-xs text-muted-foreground">{it.sub}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </>
              );
              const cls = `flex w-full items-center gap-3 px-4 py-3 text-left ${i > 0 ? "border-t border-border" : ""}`;
              return (
                <li key={it.label}>
                  <button
                    className={cls}
                    onClick={() => it.to && navigate({ to: it.to })}
                  >
                    {Inner}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {user && (
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
          className="mb-10 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      )}
    </AppLayout>
  );
}
