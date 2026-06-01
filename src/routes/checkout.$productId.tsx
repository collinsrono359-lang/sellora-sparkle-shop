import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createOrder } from "@/lib/orders.functions";
import { toast } from "sonner";
import { Loader2, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/checkout/$productId")({
  component: CheckoutPage,
});

interface Product {
  id: string; title: string; price: number; currency: string;
  photos: string[]; seller_id: string; status: string;
}

function CheckoutPage() {
  const { productId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createOrder);
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: `/checkout/${productId}` } as any });
  }, [user, loading, productId, navigate]);

  useEffect(() => {
    supabase.from("products").select("id,title,price,currency,photos,seller_id,status")
      .eq("id", productId).maybeSingle()
      .then(({ data }) => setProduct(data as Product | null));
  }, [productId]);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const checkout = async () => {
    if (!product) return;
    setBusy(true);
    try {
      const res = await createOrderFn({
        data: {
          productId: product.id,
          buyerEmail: email || undefined,
          buyerName: name || undefined,
          notes: notes || undefined,
        },
      });
      if (res.approveUrl) {
        window.location.href = res.approveUrl;
      } else {
        toast.error("Could not start payment");
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Checkout failed");
      setBusy(false);
    }
  };

  if (!product) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="mb-4 text-xl font-bold">Checkout</h1>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex gap-3">
          {product.photos[0] && (
            <img src={product.photos[0]} alt="" className="h-20 w-20 rounded-md object-cover" />
          )}
          <div className="flex-1">
            <p className="font-semibold">{product.title}</p>
            <p className="text-lg font-bold text-primary">{product.currency} {Number(product.price).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Charged in USD via PayPal at current FX rate.</p>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3" placeholder="Full name" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email (for receipt)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3" placeholder="you@example.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Notes to seller (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background p-3" placeholder="Delivery, size, etc." />
        </div>
      </div>
      <button
        onClick={checkout}
        disabled={busy || product.status !== "active"}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
        {busy ? "Redirecting to PayPal…" : "Pay with PayPal"}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Sellora collects payment, deducts a 10% platform fee, and credits the seller's wallet for withdrawal.
      </p>
    </AppLayout>
  );
}