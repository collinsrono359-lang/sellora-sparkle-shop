import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ArrowLeft, ChevronDown, Mail, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Sellora" }] }),
  component: HelpPage,
});

const FAQS = [
  { q: "How do I list a product?", a: "Tap Sell from the bottom navigation, fill in details, add photos, and publish." },
  { q: "How do payments work?", a: "Payments are processed securely via Pesapal (M-Pesa, card, bank). Verified server-side." },
  { q: "How do I get the verified badge?", a: "Submit your ID and pay the one-time KES 1,000 verification fee from Settings → Identity Verification." },
  { q: "What is a boost?", a: "Boost places your product at the top of search & feed for 7 days for KES 500." },
  { q: "How do I report a problem?", a: "Go to Settings → Report a Problem and fill out the form." },
];

function HelpPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Help Center</h1>
      </div>

      <ul className="mb-5 overflow-hidden rounded-lg border border-border bg-card">
        {FAQS.map((f, i) => (
          <li key={i} className="border-b border-border last:border-b-0">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-medium">{f.q}</span>
              <ChevronDown className={`h-4 w-4 transition ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && <p className="px-4 pb-3 text-xs text-muted-foreground">{f.a}</p>}
          </li>
        ))}
      </ul>

      <a
        href="mailto:support@sellora.app"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium"
      >
        <Mail className="h-4 w-4" /> Email support@sellora.app
      </a>
      <button
        onClick={() => navigate({ to: "/contact" })}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground"
      >
        <MessageSquare className="h-4 w-4" /> Contact Support
      </button>
      <button
        onClick={() => toast.success("Thanks for rating Sellora! ⭐")}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium"
      >
        <Star className="h-4 w-4" /> Rate Sellora
      </button>
    </AppLayout>
  );
}
