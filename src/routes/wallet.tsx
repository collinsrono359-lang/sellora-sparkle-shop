import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import {
  getWalletSummary,
  connectPayPalEmail,
  requestWithdrawal,
} from "@/lib/wallet.functions";
import { Loader2, Wallet as WalletIcon, ArrowDownToLine, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet")({
  component: WalletPage,
});

function WalletPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetcher = useServerFn(getWalletSummary);
  const connect = useServerFn(connectPayPalEmail);
  const withdraw = useServerFn(requestWithdrawal);
  const [data, setData] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const load = () => fetcher().then((r) => { setData(r); if (r.paypal?.payer_email) setEmail(r.paypal.payer_email); });

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  if (!data) return <AppLayout><div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></AppLayout>;

  const w = data.wallet;

  const saveEmail = async () => {
    if (!email) return;
    setBusy(true);
    try { await connect({ data: { email } }); toast.success("PayPal email saved"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const doWithdraw = async () => {
    const amt = Number(amount);
    if (!amt || amt < 1) { toast.error("Enter at least $1"); return; }
    setBusy(true);
    try {
      await withdraw({ data: { amountUsd: amt } });
      toast.success("Withdrawal initiated");
      setAmount("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Withdrawal failed");
    } finally { setBusy(false); }
  };

  return (
    <AppLayout>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><WalletIcon className="h-5 w-5" /> Wallet</h1>

      <div className="rounded-lg border border-border bg-[image:var(--gradient-primary)] p-5 text-primary-foreground">
        <p className="text-sm opacity-90">Available balance</p>
        <p className="text-4xl font-bold">${Number(w.available_usd).toFixed(2)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs opacity-90">
          <div>Lifetime earned: <strong>${Number(w.lifetime_earned_usd).toFixed(2)}</strong></div>
          <div>Lifetime withdrawn: <strong>${Number(w.lifetime_withdrawn_usd).toFixed(2)}</strong></div>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> PayPal account</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Enter the PayPal email that will receive your withdrawals. Must match an existing PayPal account.
        </p>
        <div className="flex gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" className="h-11 flex-1 rounded-md border border-input bg-background px-3" />
          <button onClick={saveEmail} disabled={busy} className="h-11 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            Save
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><ArrowDownToLine className="h-4 w-4" /> Withdraw</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Funds are sent via PayPal Payouts to your connected email. Processing can take a few minutes.
        </p>
        <div className="flex gap-2">
          <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in USD" className="h-11 flex-1 rounded-md border border-input bg-background px-3" />
          <button onClick={doWithdraw} disabled={busy || !data.paypal?.payer_email || Number(w.available_usd) < 1}
            className="h-11 rounded-md bg-[image:var(--gradient-primary)] px-4 font-semibold text-primary-foreground disabled:opacity-50">
            Withdraw
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">Recent transactions</h2>
        {data.transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.transactions.map((t: any) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium capitalize">{t.kind}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <p className={`font-bold ${Number(t.amount_usd) >= 0 ? "text-success" : "text-destructive"}`}>
                  {Number(t.amount_usd) >= 0 ? "+" : ""}${Number(t.amount_usd).toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.withdrawals.length > 0 && (
        <section className="mt-4 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Withdrawals</h2>
          <ul className="divide-y divide-border">
            {data.withdrawals.map((w: any) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">${Number(w.amount_usd).toFixed(2)} → {w.recipient_email}</p>
                  <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</p>
                  {w.failure_reason && <p className="text-xs text-destructive">{w.failure_reason}</p>}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{w.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppLayout>
  );
}