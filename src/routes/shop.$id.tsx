import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BadgeCheck, MapPin, Star, UserX } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/$id")({
  component: Shop,
});

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  bio: string | null;
  shop_description: string | null;
  verified: boolean;
  created_at: string;
  response_rate: number;
  avg_response_minutes: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
  reviewer_name?: string | null;
  reviewer_avatar?: string | null;
}

function Shop() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("user_id", id).maybeSingle().then(({ data }) => setProfile(data as Profile | null));
    supabase.from("products").select("id,title,price,currency,location,photos,views,seller_id").eq("seller_id", id).eq("status", "active")
      .then(({ data }) => setProducts((data as ProductCardData[]) ?? []));
    supabase.from("reviews").select("id,rating,comment,created_at,reviewer_id").eq("seller_id", id).order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const list = (data as Review[]) ?? [];
        if (list.length) {
          const ids = Array.from(new Set(list.map((r) => r.reviewer_id)));
          const { data: profs } = await supabase.from("profiles").select("user_id,display_name,avatar_url").in("user_id", ids);
          const m = new Map((profs ?? []).map((p) => [p.user_id, p]));
          setReviews(list.map((r) => ({ ...r, reviewer_name: m.get(r.reviewer_id)?.display_name ?? null, reviewer_avatar: m.get(r.reviewer_id)?.avatar_url ?? null })));
        } else setReviews([]);
      });
    if (user) {
      supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle()
        .then(({ data }) => setIsBlocked(!!data));
    }
  }, [id, user]);

  const toggleBlock = async () => {
    if (!user) {
      toast.error("Sign in to manage blocks");
      return;
    }
    if (isBlocked) {
      const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: id });
      if (error) { toast.error(error.message); return; }
    }
    setIsBlocked(!isBlocked);
    toast.success(isBlocked ? "Seller unblocked" : "Seller blocked. Their listings are now hidden.");
  };

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: reviews.filter((r) => r.rating === s).length }));

  return (
    <AppLayout>
      <div className="-mx-4 -mt-4 h-32 bg-[image:var(--gradient-primary)]">
        {profile?.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="-mt-10 flex items-end gap-3">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full border-4 border-card object-cover" />
        ) : (
          <div className="h-20 w-20 rounded-full border-4 border-card bg-muted" />
        )}
        <div className="pb-1">
          <p className="flex items-center gap-1 text-lg font-bold">
            {profile?.display_name ?? "Seller"}
            {profile?.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
          </p>
          {profile?.location && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {profile.location}</p>}
        </div>
      </div>
      {profile?.shop_description && <p className="mt-2 text-sm text-muted-foreground">{profile.shop_description}</p>}
      {profile?.bio && <p className="mt-1 text-sm">{profile.bio}</p>}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-card p-2 border border-border"><p className="font-bold">{products.length}</p><p className="text-muted-foreground">Listings</p></div>
        <div className="rounded-lg bg-card p-2 border border-border"><p className="font-bold">{profile?.response_rate ?? 0}%</p><p className="text-muted-foreground">Response</p></div>
        <div className="rounded-lg bg-card p-2 border border-border"><p className="font-bold">{profile?.avg_response_minutes ?? 0}m</p><p className="text-muted-foreground">Avg reply</p></div>
      </div>

      <section className="mt-4 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 fill-warning text-warning" />
          <span className="text-lg font-bold">{avg.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">({reviews.length} reviews)</span>
        </div>
        <div className="mt-2 space-y-1">
          {dist.map(({ s, n }) => (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3">{s}</span>
              <Star className="h-3 w-3 fill-warning text-warning" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-warning" style={{ width: `${reviews.length ? (n / reviews.length) * 100 : 0}%` }} />
              </div>
              <span className="w-6 text-right text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-lg font-bold">Reviews</h2>
          <ul className="space-y-2">
            {reviews.slice(0, 10).map((r) => {
              const initial = (r.reviewer_name || "U").charAt(0).toUpperCase();
              return (
                <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={r.reviewer_avatar ?? undefined} className="h-7 w-7 rounded-full object-cover" />
                      <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{r.reviewer_name ?? "Anonymous"}</span>
                    <div className="ml-auto flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {user && user.id !== id && (
        <button
          onClick={toggleBlock}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium ${
            isBlocked ? "border-border text-foreground" : "border-destructive/30 text-destructive"
          }`}
        >
          <UserX className="h-4 w-4" /> {isBlocked ? "Unblock Seller" : "Block Seller"}
        </button>
      )}

      <h2 className="mt-5 mb-2 text-lg font-bold">Active products</h2>
      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">No active products</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      )}
    </AppLayout>
  );
}
