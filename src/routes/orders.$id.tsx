import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { getOrder, reconcileOrder, confirmReceived } from "@/lib/orders.functions";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, CheckCircle2, XCircle, Clock, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const fetcher = useServerFn(getOrder);
  const reconcile = useServerFn(reconcileOrder);
  const confirm = useServerFn(confirmReceived);
  const [order, setOrder] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | null>(null);

  const load = async () => {
    const r = await fetcher({ data: { id } });
    setOrder(r.order);
    return r.order;
  };

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    const maxPolls = 40; // ~2 min at 3s
    const tick = async () => {
      if (cancelled) return;
      const o = await load();
      if (!o) return;
      if (o.status === "pending" && polls < maxPolls) {
        polls++;
        try { await reconcile({ data: { orderId: id } }); } catch { /* ignore */ }
        timer.current = window.setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <AppLayout><div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></AppLayout>;

  const isBuyer = user?.id === order.buyer_id;
  const isSeller = user?.id === order.seller_id;

  const handleConfirm = async () => {
    if (!window.confirm("Confirm you received this product? This releases payment to the seller and cannot be undone.")) return;
    setConfirming(true);
    try {
      await confirm({ data: { orderId: order.id } });
      toast.success("Payment released to seller");
      const r = await fetcher({ data: { id } });
      setOrder(r.order);
    } catch (e: any) {
      toast.error(e.message || "Could not release payment");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AppLayout>
      <h1 className="mb-2 text-xl font-bold">Order</h1>
      <p className="text-xs text-muted-foreground break-all">#{order.id}</p>

      <div className="my-4 flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <StatusIcon status={order.status} />
        <div>
          <p className="font-semibold capitalize">{order.status}</p>
          <p className="text-xs text-muted-foreground">
            {order.status === "pending" && "Waiting for PayPal confirmation. This page auto-refreshes."}
            {order.status === "paid" && (isBuyer
              ? "Payment received and held in escrow. Tap “Mark received” once the product arrives to release funds."
              : "Buyer has paid. Funds are held in escrow until they confirm delivery.")}
            {order.status === "released" && "Buyer confirmed delivery. Seller wallet credited."}
            {order.status === "failed" && "Payment failed or expired."}
            {order.status === "refunded" && "Payment was refunded."}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-semibold">{order.product_title}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Listed:</span> {order.original_currency} {Number(order.original_price).toLocaleString()}</div>
          <div><span className="text-muted-foreground">Charged:</span> ${Number(order.usd_amount).toFixed(2)} USD</div>
          <div><span className="text-muted-foreground">Platform fee (10%):</span> ${Number(order.platform_fee_usd).toFixed(2)}</div>
          <div><span className="text-muted-foreground">Seller net:</span> ${Number(order.seller_net_usd).toFixed(2)}</div>
        </div>
      </div>

      {isBuyer && order.status === "paid" && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
          Mark product as received
        </button>
      )}
      {isSeller && order.status === "paid" && (
        <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          Ship the product. Funds will release to your wallet once the buyer confirms receipt.
        </p>
      )}

      {order.status === "failed" && (
        <Link
          to="/checkout/$productId" params={{ productId: order.product_id }}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground"
        >
          Try again
        </Link>
      )}
      <Link to="/orders" className="mt-4 block text-center text-sm text-primary">Back to orders</Link>
    </AppLayout>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "released") return <CheckCircle2 className="h-6 w-6 text-success" />;
  if (status === "paid") return <PackageCheck className="h-6 w-6 text-primary" />;
  if (status === "failed") return <XCircle className="h-6 w-6 text-destructive" />;
  return <Clock className="h-6 w-6 text-warning animate-pulse" />;
}