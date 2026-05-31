import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { CATEGORIES } from "@/lib/countries";
import { Search as SearchIcon, X } from "lucide-react";

const TRENDING = ["iPhone", "Sneakers", "Sofa", "Laptop", "Perfume", "Bicycle"];

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  head: () => ({ meta: [{ title: "Search — Sellora" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q: initialQ } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<ProductCardData[] | null>(null);
  const [recents, setRecents] = useState<{ id: string; query: string }[]>([]);

  // Filters
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [shippingOnly, setShippingOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [datePosted, setDatePosted] = useState<"" | "24h" | "week" | "month">("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc" | "views">("newest");

  useEffect(() => {
    if (user) {
      supabase.from("recent_searches").select("id,query").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8)
        .then(({ data }) => setRecents(data ?? []));
    }
  }, [user]);

  const runSearch = async (term: string) => {
    let query = supabase
      .from("products")
      .select("id,title,price,currency,location,photos,views,seller_id,condition,category,shipping_available,created_at")
      .eq("status", "active");
    if (term) query = query.ilike("title", `%${term}%`);
    if (minPrice) query = query.gte("price", Number(minPrice));
    if (maxPrice) query = query.lte("price", Number(maxPrice));
    if (conditions.length > 0) query = query.in("condition", conditions as ("new" | "like_new" | "used" | "refurbished")[]);
    if (category) query = query.eq("category", category);
    if (shippingOnly) query = query.eq("shipping_available", true);
    if (datePosted) {
      const since = new Date();
      if (datePosted === "24h") since.setDate(since.getDate() - 1);
      if (datePosted === "week") since.setDate(since.getDate() - 7);
      if (datePosted === "month") since.setMonth(since.getMonth() - 1);
      query = query.gte("created_at", since.toISOString());
    }
    if (sort === "newest") query = query.order("created_at", { ascending: false });
    else if (sort === "price_asc") query = query.order("price", { ascending: true });
    else if (sort === "price_desc") query = query.order("price", { ascending: false });
    else if (sort === "views") query = query.order("views", { ascending: false });

    const { data } = await query.limit(60);
    setResults((data as ProductCardData[]) ?? []);

    if (user && term.trim()) {
      await supabase.from("recent_searches").insert({ user_id: user.id, query: term.trim() });
    }
  };

  useEffect(() => { if (initialQ) runSearch(initialQ); /* eslint-disable-next-line */ }, []);

  const clearRecents = async () => {
    if (!user) return;
    await supabase.from("recent_searches").delete().eq("user_id", user.id);
    setRecents([]);
  };

  return (
    <AppLayout>
      <form
        onSubmit={(e) => { e.preventDefault(); runSearch(q); navigate({ to: "/search", search: { q } }); }}
        className="mb-3"
      >
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products..."
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-3 text-sm"
          />
        </label>
      </form>

      <details className="mb-4 rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold">Filters</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex gap-2">
            <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} type="number" placeholder="Min price" className="h-10 flex-1 rounded-md border border-border bg-background px-3" />
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} type="number" placeholder="Max price" className="h-10 flex-1 rounded-md border border-border bg-background px-3" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Condition</p>
            <div className="flex flex-wrap gap-2">
              {["new", "like_new", "used", "refurbished"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConditions((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c])}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${conditions.includes(c) ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {c.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center justify-between"><span>Shipping available</span>
            <input type="checkbox" checked={shippingOnly} onChange={(e) => setShippingOnly(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between"><span>Verified sellers only</span>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          </label>
          <select value={datePosted} onChange={(e) => setDatePosted(e.target.value as "" | "24h" | "week" | "month")} className="h-10 w-full rounded-md border border-border bg-background px-3">
            <option value="">Any date</option>
            <option value="24h">Last 24 hours</option>
            <option value="week">Last week</option>
            <option value="month">Last month</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "price_asc" | "price_desc" | "views")} className="h-10 w-full rounded-md border border-border bg-background px-3">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="views">Most viewed</option>
          </select>
          <button type="button" onClick={() => runSearch(q)} className="h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">Apply filters</button>
        </div>
      </details>

      {results === null && (
        <>
          {recents.length > 0 && (
            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent searches</h2>
                <button onClick={clearRecents} className="text-xs text-primary">Clear all</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button key={r.id} onClick={() => { setQ(r.query); runSearch(r.query); }} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                    {r.query} <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold">Trending</h2>
            <div className="flex flex-wrap gap-2">
              {TRENDING.map((t) => (
                <button key={t} onClick={() => { setQ(t); runSearch(t); }} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground">
                  {t}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {results !== null && (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{results.length} result{results.length !== 1 && "s"}</p>
          <div className="grid grid-cols-2 gap-3">
            {results.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </>
      )}
    </AppLayout>
  );
}
