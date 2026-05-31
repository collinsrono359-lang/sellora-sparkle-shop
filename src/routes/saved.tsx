import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { FolderPlus, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/saved")({
  head: () => ({ meta: [{ title: "Saved — Sellora" }] }),
  component: Saved,
});

interface Collection { id: string; name: string }

function Saved() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!user) return;
    (async () => {
      const { data: favs } = await supabase
        .from("favorites")
        .select("product_id, products(id,title,price,currency,location,photos,views,seller_id)")
        .eq("user_id", user.id);
      type FavRow = { product_id: string; products: ProductCardData | null };
      setProducts(((favs as FavRow[]) ?? []).map((f) => f.products).filter((x): x is ProductCardData => !!x));
      const { data: cols } = await supabase.from("collections").select("id,name").eq("user_id", user.id).order("created_at");
      setCollections((cols as Collection[]) ?? []);
    })();
  }, [user, loading, navigate]);

  const createCollection = async () => {
    if (!user || !newName.trim()) return;
    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: newName.trim(), is_public: false, share_token: crypto.randomUUID() })
      .select("id,name")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setCollections([...collections, data]);
      setNewName("");
      toast.success("Collection created");
    }
  };

  const shareCollection = async (col: Collection) => {
    const { data } = await supabase.from("collections").select("share_token").eq("id", col.id).single();
    const url = `${window.location.origin}/collection/${data?.share_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  };

  return (
    <AppLayout>
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold"><Heart className="h-5 w-5 text-primary" /> Saved</h1>

      <section className="mb-4 rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FolderPlus className="h-4 w-4" /> Collections</h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Dream Home"
            maxLength={60}
            className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <button onClick={createCollection} className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Create</button>
        </div>
        {collections.length > 0 && (
          <ul className="mt-2 space-y-1">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm">
                <span>{c.name}</span>
                <button onClick={() => shareCollection(c)} aria-label={`Share ${c.name}`}>
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No saved items yet. Tap the heart on any product to save it.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </AppLayout>
  );
}
