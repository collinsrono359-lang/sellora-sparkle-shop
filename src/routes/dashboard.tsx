import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Archive, BadgeCheck, Box, Eye, Inbox, Mail, Plus, Rocket, Settings, Star, Store, UserPen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sellora" }] }),
  component: Dashboard,
});

interface MiniProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  photos: string[];
  views: number;
  status: string;
}

type StatusFilter = "all" | "active" | "archived" | "sold";

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; location: string | null; verified: boolean } | null>(null);
  const [products, setProducts] = useState<MiniProduct[]>([]);
  const [counts, setCounts] = useState({ products: 0, active: 0, views: 0, reviews: 0 });
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name,avatar_url,location,verified,country")
        .eq("user_id", user.id)
        .maybeSingle();
      // Force completion of profile (name + GPS country) before using the app
      if (!prof?.display_name || !prof?.country) {
        toast.info("Please complete your profile to continue.");
        navigate({ to: "/onboarding" });
        return;
      }
      setProfile(prof);
      const { data: prods } = await supabase
        .from("products")
        .select("id,title,price,currency,photos,views,status,created_at")
        .eq("seller_id", user.id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      const list = (prods as MiniProduct[]) ?? [];
      setProducts(list);
      const { count: revCount } = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("seller_id", user.id);
      setCounts({
        products: list.length,
        active: list.filter((p) => p.status === "active").length,
        views: list.reduce((s, p) => s + p.views, 0),
        reviews: revCount ?? 0,
      });
    })();
  }, [user, loading, navigate]);

  const updateStatus = async (id: string, status: "active" | "archived" | "sold" | "deleted") => {
    if (!user) return;
    const patch = status === "deleted"
      ? { status, deleted_at: new Date().toISOString() }
      : { status };
    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("seller_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Product ${status}`);
    setProducts((prev) =>
      status === "deleted"
        ? prev.filter((p) => p.id !== id)
        : prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
    setCounts((c) => ({
      ...c,
      active: status === "active" ? c.active + 1 : c.active,
    }));
  };

  return (
    <AppLayout>
      <div className="-mx-4 -mt-4 bg-primary-soft px-4 py-4">
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted" />
          )}
          <div>
            <p className="flex items-center gap-1 text-xl font-bold">
              {profile?.display_name ?? "User"}
              {profile?.verified && <BadgeCheck className="h-5 w-5 text-primary" />}
            </p>
            <p className="text-sm text-muted-foreground">{profile?.location ?? "—"}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            ["Products", counts.products],
            ["Active", counts.active],
            ["Views", counts.views],
            ["Reviews", counts.reviews],
          ].map(([label, val]) => (
            <div key={label} className="rounded-lg bg-card p-3 text-center">
              <p className="text-lg font-bold text-primary">{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/payments" className="flex items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] py-3 font-semibold text-primary-foreground">
          <Rocket className="h-4 w-4" /> Boost Sales
        </Link>
        <Link to="/kyc" className="flex items-center justify-center gap-2 rounded-md bg-primary-soft py-3 font-semibold text-accent-foreground">
          <BadgeCheck className="h-4 w-4" /> Get Verified
        </Link>
      </div>

      <div className="mt-3 rounded-lg bg-primary-soft p-3 text-sm">
        <p className="font-semibold text-accent-foreground">📈 Get up to 1,000 views/day!</p>
        <p className="text-xs text-muted-foreground">Boost your products to reach more buyers.</p>
      </div>

      <h2 className="mt-5 text-lg font-bold">Dashboard</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <FilterTile icon={Box} label="My Products" sub={`${counts.products} items`} active={filter === "all"} onClick={() => setFilter("all")} />
        <Tile icon={Star} label="Reviews" sub={`${counts.reviews} items`} to={user ? `/shop/${user.id}` : "/"} />
        <Tile icon={Inbox} label="Inbox" to="/inbox" />
        <FilterTile icon={Archive} label="Archived" sub={`${products.filter((p) => p.status === "archived").length} items`} active={filter === "archived"} onClick={() => setFilter("archived")} />
        <FilterTile icon={Eye} label="Sold Out" sub={`${products.filter((p) => p.status === "sold").length} items`} active={filter === "sold"} onClick={() => setFilter("sold")} />
        <Tile icon={UserPen} label="Edit Profile" to="/onboarding" />
        <Tile icon={Store} label="View Shop" to={user ? `/shop/${user.id}` : "/"} />
        <Tile icon={Plus} label="Add Product" to="/sell" />
        <Tile icon={Settings} label="Settings" to="/settings" />
        <Tile icon={Mail} label="Contact Admin" to="/contact" />
      </div>

      <h2 className="mt-5 flex items-center justify-between text-lg font-bold">
        <span className="capitalize">{filter === "all" ? "My Products" : `${filter} Products`}</span>
        {filter !== "all" && (
          <button onClick={() => setFilter("all")} className="text-sm font-medium text-primary">
            Show all
          </button>
        )}
      </h2>
      <div className="mt-2 space-y-2">
        {(() => {
          const list = filter === "all" ? products : products.filter((p) => p.status === filter);
          if (list.length === 0)
            return (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {filter === "all" ? "No products yet" : `No ${filter} products`}
              </p>
            );
          return list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <Link to="/product/$id" params={{ id: p.id }} className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {p.photos[0] && <img src={p.photos[0]} alt="" className="h-full w-full object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 font-semibold">{p.title}</p>
                <p className="text-sm font-bold text-primary">{p.currency} {p.price.toLocaleString()}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" /> {p.views} • <span className="capitalize">{p.status}</span></p>
              </div>
              <div className="flex flex-col gap-1">
                <Link to="/product/$id/edit" params={{ id: p.id }} className="rounded-md bg-primary-soft px-3 py-1 text-center text-xs font-medium text-accent-foreground">Edit</Link>
                {p.status !== "sold" && (
                  <button type="button" onClick={() => updateStatus(p.id, "sold")} className="rounded-md bg-warning/30 px-3 py-1 text-xs font-medium">Sold Out</button>
                )}
                {p.status === "archived" ? (
                  <button onClick={() => updateStatus(p.id, "active")} className="rounded-md bg-primary/20 px-3 py-1 text-xs font-medium text-primary">Unarchive</button>
                ) : (
                  <button onClick={() => updateStatus(p.id, "archived")} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium">Archive</button>
                )}
                <button onClick={() => updateStatus(p.id, "deleted")} className="rounded-md bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive">Delete</button>
              </div>
            </div>
          ));
        })()}
      </div>
    </AppLayout>
  );
}

function FilterTile({
  icon: Icon,
  label,
  sub,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary"
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </button>
  );
}

function Tile({ icon: Icon, label, sub, to }: { icon: React.ComponentType<{ className?: string }>; label: string; sub?: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className="h-5 w-5 text-primary" />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Link>
  );
}
