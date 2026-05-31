import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/countries";
import { Search, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlockedSellers } from "@/hooks/use-blocked";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sellora — Discover Products" },
      { name: "description", content: "Browse thousands of listings from verified sellers around the world." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const blocked = useBlockedSellers();
  const [products, setProducts] = useState<ProductCardData[] | null>(null);
  const [category, setCategory] = useState<string>("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    let query = supabase
      .from("products")
      .select("id,title,price,currency,location,photos,views,seller_id,category")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(40);
    if (category !== "All") query = query.eq("category", category);
    query.then(({ data }) => setProducts((data as ProductCardData[]) ?? []));
  }, [category]);

  const visible = useMemo(
    () => (products ?? []).filter((p) => !blocked.has(p.seller_id)),
    [products, blocked]
  );

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate({ to: "/search", search: { q: q.trim() } });
  };

  return (
    <AppLayout>
      <h1 className="sr-only">Sellora marketplace</h1>
      <form onSubmit={onSubmitSearch} className="mb-3 flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products..."
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <Link
          to="/search"
          search={{ q: "" }}
          aria-label="Filters"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Link>
      </form>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
              category === c
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {products === null ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No products yet. Be the first to list one!</p>
          <Link to="/sell" className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Sell something
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
