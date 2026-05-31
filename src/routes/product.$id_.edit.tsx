import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { GuestGate } from "@/components/GuestGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/countries";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/product/$id_/edit")({
  head: () => ({ meta: [{ title: "Edit product — Sellora" }] }),
  component: EditProduct,
});

const CONDITIONS = ["new", "like_new", "used", "refurbished"] as const;
const STATUSES = ["active", "archived", "sold"] as const;

const Schema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  price: z.coerce.number().positive("Price must be greater than 0").max(10_000_000),
  description: z.string().trim().max(1000).optional().default(""),
  condition: z.enum(CONDITIONS),
  category: z.string().trim().min(1).max(80),
  location: z.string().trim().max(160).optional().default(""),
  shipping_available: z.boolean(),
  status: z.enum(STATUSES),
});

function EditProduct() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [loadingProd, setLoadingProd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [form, setForm] = useState({
    title: "",
    price: "",
    description: "",
    condition: "new" as (typeof CONDITIONS)[number],
    category: CATEGORIES[0],
    location: "",
    shipping_available: true,
    status: "active" as (typeof STATUSES)[number],
  });

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Product not found");
        navigate({ to: "/dashboard" });
        return;
      }
      if (data.seller_id !== user.id) {
        toast.error("You can only edit your own listings");
        navigate({ to: "/product/$id", params: { id } });
        return;
      }
      setAllowed(true);
      setForm({
        title: data.title,
        price: String(data.price),
        description: data.description ?? "",
        condition: (data.condition as (typeof CONDITIONS)[number]) ?? "new",
        category: data.category,
        location: data.location ?? "",
        shipping_available: data.shipping_available,
        status: (data.status as (typeof STATUSES)[number]) ?? "active",
      });
      setLoadingProd(false);
    })();
  }, [id, user, loading, navigate]);

  if (loading) return <AppLayout><p className="text-sm text-muted-foreground">Loading…</p></AppLayout>;
  if (!user) return <AppLayout><GuestGate message="Sign in to edit your product." /></AppLayout>;
  if (loadingProd || !allowed) return <AppLayout><p className="text-sm text-muted-foreground">Loading product…</p></AppLayout>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your inputs");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("products")
      .update({
        title: parsed.data.title,
        price: parsed.data.price,
        description: parsed.data.description || null,
        condition: parsed.data.condition,
        category: parsed.data.category,
        location: parsed.data.location || null,
        shipping_available: parsed.data.shipping_available,
        status: parsed.data.status,
      })
      .eq("id", id)
      .eq("seller_id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Product updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/dashboard" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Edit Product</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Title">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} className="input" />
        </Field>
        <Field label="Price (KES)">
          <input type="number" min={1} required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" />
        </Field>
        <Field label="Description">
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} rows={4} className="input min-h-[100px] py-2" />
        </Field>
        <Field label="Condition">
          <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as (typeof CONDITIONS)[number] })} className="input">
            {CONDITIONS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={160} className="input" />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as (typeof STATUSES)[number] })} className="input">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="sold">Sold</option>
          </select>
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <span className="text-sm font-medium">Shipping available?</span>
          <input type="checkbox" checked={form.shipping_available} onChange={(e) => setForm({ ...form, shipping_available: e.target.checked })} className="h-5 w-5" />
        </label>

        <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {busy ? "Saving..." : "Save changes"}
        </button>
      </form>

      <style>{`.input{height:44px;width:100%;border:1px solid var(--border);background:var(--card);border-radius:8px;padding:0 12px;font-size:14px;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
