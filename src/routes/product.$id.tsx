import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useBlockedSellers } from "@/hooks/use-blocked";
import { Eye, Heart, MapPin, MessageSquare, Share2, Star, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
});

interface Product {
  id: string;
  title: string;
  price: number;
  currency: string;
  description: string | null;
  condition: string;
  category: string;
  location: string | null;
  shipping_available: boolean;
  photos: string[];
  views: number;
  seller_id: string;
}

function ProductPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const blocked = useBlockedSellers();
  const navigate = useNavigate();
  const [p, setP] = useState<Product | null>(null);
  const [seller, setSeller] = useState<{ display_name: string | null; avatar_url: string | null; location: string | null; verified: boolean } | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState<string>("misleading");
  const [reportDetails, setReportDetails] = useState("");

  const isBlocked = !!p && blocked.has(p.seller_id);

  useEffect(() => {
    let cancelled = false;
    supabase.from("products").select("*").eq("id", id).maybeSingle().then(async ({ data }) => {
      if (cancelled || !data) return;
      setP(data as Product);
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name,avatar_url,location,verified")
        .eq("user_id", data.seller_id)
        .maybeSingle();
      if (!cancelled) setSeller(prof ? { ...prof, verified: !!prof.verified } : null);
    });
    if (user) {
      supabase.from("favorites").select("id").eq("user_id", user.id).eq("product_id", id).maybeSingle()
        .then(({ data }) => setSaved(!!data));
    }
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  // Record one view per (product, viewer-or-IP) only after 10 seconds of dwell time.
  useEffect(() => {
    if (!p) return;
    const sessionKey = `viewed:${id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    const timer = setTimeout(async () => {
      // Best-effort IP fetch for guests (so the unique constraint can dedupe).
      let ip: string | null = null;
      if (!user) {
        try {
          const res = await fetch("https://api.ipify.org?format=json");
          if (res.ok) ip = (await res.json()).ip ?? null;
        } catch {
          ip = null;
        }
      }
      const { data: bumped } = await supabase.rpc("record_product_view", {
        _product_id: id,
        _viewer_ip: ip ?? "",
      });
      sessionStorage.setItem(sessionKey, "1");
      if (bumped) setP((prev) => (prev ? { ...prev, views: (prev.views ?? 0) + 1 } : prev));
    }, 10_000);
    return () => clearTimeout(timer);
  }, [p, id, user]);

  if (!p) return <AppLayout><p className="p-8 text-center text-muted-foreground">Loading...</p></AppLayout>;

  const toggleSave = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (saved) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", id);
      setSaved(false);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, product_id: id });
      setSaved(true);
    }
  };

  const submitReview = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (!seller?.verified) {
      toast.error("Reviews are only allowed for verified sellers.");
      return;
    }
    const { error } = await supabase.from("reviews").upsert(
      {
        seller_id: p.seller_id,
        reviewer_id: user.id,
        rating,
        comment: comment.trim() || null,
      },
      { onConflict: "seller_id,reviewer_id" }
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Review submitted");
      setComment("");
    }
  };

  const submitReport = async () => {
    if (!user) return navigate({ to: "/auth" });
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_user_id: p.seller_id,
      target_product_id: p.id,
      // typed enum cast at the DB level via string match
      reason: reportReason as "misleading" | "counterfeit" | "scam" | "inappropriate" | "other",
      details: reportDetails,
    });
    if (error) toast.error(error.message);
    else toast.success("Report submitted. Thank you.");
  };

  const messageSeller = () => {
    if (!user) return navigate({ to: "/auth" });
    if (user.id === p.seller_id) return toast.info("This is your own listing");
    if (isBlocked) return toast.error("You blocked this seller. Unblock them from their shop page to message.");
    navigate({ to: "/inbox/$userId", params: { userId: p.seller_id }, search: { product: p.id } });
  };

  const share = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: p.title, url }).catch(() => {});
    else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  return (
    <AppLayout>
      <div className="-mx-4 aspect-square overflow-hidden bg-muted">
        {p.photos[photoIdx] ? (
          <img src={p.photos[photoIdx]} alt={p.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">No photo</div>
        )}
      </div>
      {p.photos.length > 1 && (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          {p.photos.map((src, i) => (
            <button
              key={i}
              onClick={() => setPhotoIdx(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${i === photoIdx ? "border-primary" : "border-transparent"}`}
            >
              <img src={src} alt={`Thumbnail ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <h1 className="mt-4 text-xl font-bold">{p.title}</h1>
      <p className="text-2xl font-bold text-primary">{p.currency} {p.price.toLocaleString()}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {p.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {p.location}</span>}
        {p.shipping_available && <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Shipping</span>}
        <span className="ml-auto flex items-center gap-1"><Eye className="h-4 w-4" /> {p.views} views</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium capitalize text-accent-foreground">{p.condition.replace("_", " ")}</span>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">{p.category}</span>
      </div>

      {p.description && <p className="mt-4 whitespace-pre-line text-sm">{p.description}</p>}

      <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
        <strong>First delivery?</strong> Meet in a public place, inspect the item before paying, and use Sellora chat for all communication. Avoid sending money before delivery.
      </div>

      <div className="mt-4 flex gap-2">
        {user && user.id !== p.seller_id && !isBlocked ? (
          <Link
            to="/inbox/$userId"
            params={{ userId: p.seller_id }}
            search={{ product: p.id }}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground"
          >
            <MessageSquare className="h-5 w-5" /> Message Seller
          </Link>
        ) : (
          <button
            onClick={messageSeller}
            disabled={isBlocked}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-50"
          >
            <MessageSquare className="h-5 w-5" /> {isBlocked ? "Seller Blocked" : "Message Seller"}
          </button>
        )}
        <button onClick={toggleSave} aria-label={saved ? "Unsave" : "Save"} className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
          <Heart className={`h-5 w-5 ${saved ? "fill-primary text-primary" : ""}`} />
        </button>
        <button onClick={share} aria-label="Share" className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {user && user.id !== p.seller_id && !isBlocked && p.status === "active" && (
        <Link
          to="/checkout/$productId"
          params={{ productId: p.id }}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-success font-semibold text-success-foreground"
        >
          Buy Now · {p.currency} {p.price.toLocaleString()}
        </Link>
      )}

      <Link
        to="/shop/$id"
        params={{ id: p.seller_id }}
        className="mt-4 flex items-center gap-3 rounded-lg bg-secondary p-3"
      >
        {seller?.avatar_url ? (
          <img src={seller.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted" />
        )}
        <div>
          <p className="font-bold">{seller?.display_name ?? "Seller"}</p>
          {seller?.location && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {seller.location}</p>}
        </div>
      </Link>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">Write a Review</h2>
        {seller && !seller.verified ? (
          <p className="text-sm text-muted-foreground">Reviews are only available for verified sellers.</p>
        ) : (
          <>
            <div className="mb-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                  <Star className={`h-6 w-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              maxLength={500}
              className="min-h-[80px] w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <button onClick={submitReview} className="mt-2 rounded-md bg-primary/30 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary">
              Submit
            </button>
          </>
        )}
      </section>

      <Dialog>
        <DialogTrigger asChild>
          <button className="mt-3 w-full rounded-md border border-destructive/30 py-2 text-sm font-medium text-destructive">
            Report Seller
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Report this seller</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm">
              <option value="misleading">Misleading description</option>
              <option value="counterfeit">Counterfeit</option>
              <option value="scam">Scam</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Other</option>
            </select>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Additional details (optional)"
              maxLength={500}
              className="min-h-[80px] w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <button onClick={submitReport} className="w-full rounded-md bg-destructive py-2 text-sm font-semibold text-destructive-foreground">
              Submit report
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
