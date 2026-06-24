import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { reportSuspiciousIp, checkIpBlock } from "@/lib/account.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert, Lock } from "lucide-react";

const GUEST_LIMIT_MS = 5 * 60 * 1000; // 5 min
const PAGE_RATE_LIMIT = 25; // > 25 product views in 60s => scrape

async function getIp(): Promise<{ ip: string | null; country?: string; tz?: string; org?: string }> {
  try {
    const r = await fetch("https://ipapi.co/json/");
    if (!r.ok) return { ip: null };
    const j = await r.json();
    return { ip: j.ip, country: j.country_code, tz: j.timezone, org: j.org };
  } catch { return { ip: null }; }
}

export function GuestActivityGuard() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState<null | { title: string; body: string; permanent?: boolean }>(null);
  const reportFn = useServerFn(reportSuspiciousIp);
  const checkFn = useServerFn(checkIpBlock);
  const viewsRef = useRef<number[]>([]);
  const reportedRef = useRef(false);

  // 1) IP block check on mount
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { ip, tz, country, org } = await getIp();
      if (!ip) return;

      // a) blocked already?
      try {
        const res = await checkFn({ data: { ip } });
        if (res.blocked) {
          setShow({
            title: "Access blocked",
            body: `${res.reason ?? "Suspicious activity detected from your network."} Please sign in to continue.`,
            permanent: res.permanent,
          });
          return;
        }
      } catch { /* ignore */ }

      // b) VPN / proxy / datacenter heuristic
      const orgStr = (org ?? "").toLowerCase();
      const looksVpn = /(vpn|proxy|hosting|cloud|digitalocean|ovh|linode|amazon|google|hetzner|m247|datacamp|leaseweb|choopa|vultr)/.test(orgStr);
      const tzCountry = (tz ?? "").split("/")[0];
      const tzMismatch = country && tz && !["UTC", "GMT"].includes(tz) && tzCountry && !tz.toLowerCase().includes((country ?? "").toLowerCase());
      if (!user && (looksVpn || tzMismatch)) {
        reportedRef.current = true;
        try {
          await reportFn({ data: { ip, reason: `Suspected VPN/proxy (${org ?? "unknown"})`, category: "vpn_proxy", minutes: 5 } });
        } catch { /* ignore */ }
        setShow({
          title: "VPN / proxy detected",
          body: "Please disable your VPN or proxy and sign in to continue browsing Sellora.",
        });
      }
    })();
  }, [loading, user, checkFn, reportFn]);

  // 2) 5-minute guest browse limit
  useEffect(() => {
    if (loading || user) return;
    const key = "sellora_guest_start";
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(Date.now()));
    const start = Number(sessionStorage.getItem(key));
    const remaining = GUEST_LIMIT_MS - (Date.now() - start);
    if (remaining <= 0) {
      void triggerAutoBrowse();
      return;
    }
    const t = setTimeout(() => void triggerAutoBrowse(), remaining);
    return () => clearTimeout(t);
    async function triggerAutoBrowse() {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const { ip } = await getIp();
      if (ip) {
        try {
          await reportFn({ data: { ip, reason: "Guest browsed >5 min without sign-in (possible automation)", category: "auto_browse", minutes: 5 } });
        } catch { /* ignore */ }
      }
      setShow({
        title: "Please sign in to continue",
        body: "You've been browsing as a guest for 5 minutes. To prevent abuse, please sign in or create a free account to keep browsing.",
      });
    }
  }, [loading, user, reportFn]);

  // 3) Scrape detection (too many product views in short window)
  useEffect(() => {
    if (loading) return;
    const onView = () => {
      const now = Date.now();
      viewsRef.current = viewsRef.current.filter((t) => now - t < 60_000);
      viewsRef.current.push(now);
      if (viewsRef.current.length > PAGE_RATE_LIMIT && !reportedRef.current) {
        reportedRef.current = true;
        void (async () => {
          const { ip } = await getIp();
          if (ip) {
            try {
              await reportFn({ data: { ip, reason: `Scrape detected: ${viewsRef.current.length} product views in 60s`, category: "scrape", minutes: 30 } });
            } catch { /* ignore */ }
          }
          setShow({
            title: "Unusual activity",
            body: "Your network has been temporarily blocked for automated scraping. Sign in to verify you're human.",
          });
        })();
      }
    };
    window.addEventListener("sellora:product-view", onView);
    return () => window.removeEventListener("sellora:product-view", onView);
  }, [loading, reportFn]);

  if (!show) return null;

  return (
    <Dialog open onOpenChange={() => { /* persistent */ }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            {show.title}
          </DialogTitle>
          <DialogDescription>{show.body}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-700 dark:text-amber-300">Warning</p>
          <p className="text-muted-foreground">
            Continued automation, scraping, hacking attempts, or VPN abuse may result in a permanent IP and account ban.
          </p>
        </div>
        <DialogFooter>
          <Link
            to="/auth"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground"
          >
            <Lock className="h-4 w-4" /> Sign in / Create account
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}