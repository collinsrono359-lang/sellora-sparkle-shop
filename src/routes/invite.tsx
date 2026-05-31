import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite")({
  head: () => ({ meta: [{ title: "Invite Friends — Sellora" }] }),
  component: InvitePage,
});

function InvitePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const code = (user?.id || "FRIEND").slice(0, 8).toUpperCase();
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/auth?ref=${code}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join Sellora", text: "Buy & sell on Sellora", url: link });
      } catch { /* ignore */ }
    } else {
      copy();
    }
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Invite Friends</h1>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-6 text-center">
        <Gift className="mx-auto mb-3 h-10 w-10 text-primary" />
        <p className="font-semibold">Earn KES 200 per friend</p>
        <p className="text-xs text-muted-foreground">When they list their first product</p>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Your invite link</p>
        <p className="break-all text-sm font-medium">{link}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={copy} className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium">
          <Copy className="h-4 w-4" /> Copy
        </button>
        <button onClick={share} className="flex items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground">
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>
    </AppLayout>
  );
}
