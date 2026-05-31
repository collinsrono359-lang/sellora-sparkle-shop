import { Link } from "@tanstack/react-router";
import { Eye, Heart, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserCurrency } from "@/hooks/use-user-currency";
import { formatMoney } from "@/lib/currency";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export interface ProductCardData {
  id: string;
  title: string;
  price: number;
  currency: string;
  location: string | null;
  photos: string[];
  views: number;
  seller_id: string;
}

export function ProductCard({ p }: { p: ProductCardData }) {
  const { user } = useAuth();
  const { currency: userCurrency, convertTo } = useUserCurrency();
  const [saved, setSaved] = useState(false);
  const [displayPrice, setDisplayPrice] = useState<string>(`${p.currency} ${p.price.toLocaleString()}`);
  const [seller, setSeller] = useState<{ display_name: string | null; avatar_url: string | null; suspended_until: string | null }>({
    display_name: null,
    avatar_url: null,
    suspended_until: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (userCurrency && userCurrency !== p.currency) {
          const v = await convertTo(p.price, p.currency);
          if (!cancelled) setDisplayPrice(`${formatMoney(v, userCurrency)} · ${p.currency} ${p.price.toLocaleString()}`);
        } else {
          setDisplayPrice(formatMoney(p.price, p.currency));
        }
      } catch {
        setDisplayPrice(`${p.currency} ${p.price.toLocaleString()}`);
      }
    })();
    return () => { cancelled = true; };
  }, [p.price, p.currency, userCurrency, convertTo]);

  useEffect(() => {
    supabase.from("profiles").select("display_name,avatar_url,suspended_until").eq("user_id", p.seller_id).maybeSingle()
      .then(({ data }) => data && setSeller(data));
    if (user) {
      supabase.from("favorites").select("id").eq("user_id", user.id).eq("product_id", p.id).maybeSingle()
        .then(({ data }) => setSaved(!!data));
    }
  }, [p.id, p.seller_id, user]);

  const toggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in to save items");
      return;
    }
    if (saved) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", p.id);
      setSaved(false);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, product_id: p.id });
      setSaved(true);
    }
  };

  const initial = (seller.display_name || "S").charAt(0).toUpperCase();

  return (
    <Link
      to="/product/$id"
      params={{ id: p.id }}
      className="block overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-elegant)]"
    >
      <div className="relative aspect-square w-full bg-muted">
        {p.photos[0] ? (
          <img
            src={p.photos[0]}
            alt={p.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No photo</div>
        )}
        <button
          onClick={toggleSave}
          aria-label={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 backdrop-blur"
        >
          <Heart className={`h-4 w-4 ${saved ? "fill-primary text-primary" : "text-foreground"}`} />
        </button>
        {seller.suspended_until && new Date(seller.suspended_until) > new Date() && (
          <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground shadow">
            Seller suspended
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-sm font-bold text-primary">{displayPrice}</p>
        <p className="line-clamp-1 text-sm font-medium text-foreground">{p.title}</p>
        {p.location && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {p.location}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={seller.avatar_url ?? undefined} alt="" className="h-5 w-5 rounded-full object-cover" />
              <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
            </Avatar>
            <span className="line-clamp-1 text-xs text-muted-foreground">{seller.display_name ?? "Seller"}</span>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" /> {p.views}
          </span>
        </div>
      </div>
    </Link>
  );
}
