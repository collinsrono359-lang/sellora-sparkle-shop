import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { listMyOrders } from "@/lib/orders.functions";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetcher = useServerFn(listMyOrders);
  const [orders, setOrders] = useState<any[] | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    fetcher().then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  }, [user, fetcher]);

  if (!orders) {
    return <AppLayout><div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <h1 className="mb-4 text-xl font-bold">Your orders</h1>
      {orders.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      )}
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link to="/orders/$id" params={{ id: o.id }} className="block rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{o.product_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.buyer_id === user?.id ? "Bought" : "Sold"} · {new Date(o.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">${Number(o.usd_amount).toFixed(2)}</p>
                  <StatusPill status={o.status} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    paid: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    failed: "bg-destructive/15 text-destructive",
    refunded: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls[status] || "bg-muted"}`}>{status}</span>;
}