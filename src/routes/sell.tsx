import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { GuestGate } from "@/components/GuestGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { recordEvent, isSuspended } from "@/lib/moderation-client";
import { CATEGORIES, COUNTRIES } from "@/lib/countries";
import { describeGeoError, requestGeolocation } from "@/lib/geo";
import { detectBanned } from "@/lib/banned-items";
import { currencyForCountry, toUsd, USD_REVIEW_THRESHOLD, formatMoney } from "@/lib/currency";
import { ArrowLeft, CheckCircle2, Image as ImageIcon, Loader2, MapPin, Upload, X } from "lucide-react";
import { toast } from "sonner";

const SellSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  price: z.coerce.number().positive("Price must be greater than 0").max(10_000_000, "Price is too large"),
  description: z.string().trim().max(1000).optional().default(""),
  category: z.string().trim().min(1).max(80),
});

export const Route = createFileRoute("/sell")({
  head: () => ({ meta: [{ title: "Sell a product — Sellora" }] }),
  component: Sell,
});

const CONDITIONS = [
  { v: "new", label: "New" },
  { v: "like_new", label: "Like New" },
  { v: "used", label: "Used" },
  { v: "refurbished", label: "Refurbished" },
] as const;

function Sell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<typeof CONDITIONS[number]["v"]>("new");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [shipping, setShipping] = useState(true);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoConfirmed, setGeoConfirmed] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const detectLocation = async () => {
    setGeoBusy(true);
    try {
      const g = await requestGeolocation();
      setCountry(g.country);
      setLocation(g.city || "");
      setGeoConfirmed(true);
      toast.success(`Listing location verified: ${g.city ? g.city + ", " : ""}${g.country}`);
    } catch (e) {
      toast.error(describeGeoError(e));
    } finally {
      setGeoBusy(false);
    }
  };

  const addPhotos = (files: FileList) => {
    const remaining = 3 - photos.length;
    const next = Array.from(files).slice(0, remaining);
    setPhotos([...photos, ...next]);
    setPreviews([...previews, ...next.map((f) => URL.createObjectURL(f))]);
  };
  const removePhoto = (i: number) => {
    setPhotos(photos.filter((_, idx) => idx !== i));
    setPreviews(previews.filter((_, idx) => idx !== i));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const susp = await isSuspended(user.id);
    if (susp.suspended) {
      toast.error(`Account suspended until ${new Date(susp.until!).toLocaleString()}`);
      return;
    }

    // Rate-limit: max 3 products per minute
    const RATE_KEY = "sellora_post_timestamps";
    const now = Date.now();
    const stored = JSON.parse(localStorage.getItem(RATE_KEY) || "[]") as number[];
    const recent = stored.filter((t) => now - t < 60_000);
    if (recent.length >= 3) {
      toast.error("You're posting too fast. Please wait a minute before listing again.");
      return;
    }

    const parsed = SellSchema.safeParse({
      title,
      price,
      description,
      category,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your inputs");
      return;
    }
    if (photos.length === 0) return toast.error("At least one photo is required");

    // Block illegal / restricted items
    const banned = detectBanned(`${parsed.data.title} ${parsed.data.description ?? ""}`);
    if (banned) {
      toast.error(`This listing appears to contain a restricted item ("${banned}"). It cannot be posted.`);
      void recordEvent({
        type: "post",
        content: `[BLOCKED:${banned}] ${parsed.data.title}`,
        userId: user.id,
        metadata: { blocked: true, keyword: banned },
      });
      return;
    }

    // Verify location: GPS preferred; manual fallback allowed if GPS is slow/blocked
    setBusy(true);
    let verifiedCountry = country;
    let verifiedCity = location;
    if (manualMode) {
      if (!country.trim()) {
        setBusy(false);
        return toast.error("Please select your country.");
      }
      if (!location.trim()) {
        setBusy(false);
        return toast.error("Please enter your city / area.");
      }
    } else {
      try {
        const g = await requestGeolocation();
        verifiedCountry = g.country;
        verifiedCity = location.trim() || g.city;
        setCountry(verifiedCountry);
        setLocation(verifiedCity);
        setGeoConfirmed(true);
      } catch (err) {
        setBusy(false);
        return toast.error(
          "Location must be verified to list. " + describeGeoError(err) + ' Tap "Enter location manually" if GPS is unavailable.',
        );
      }
    }

    // Determine USD value & whether the listing needs admin review
    const localCurrency = currencyForCountry(verifiedCountry);
    let usdValue = parsed.data.price;
    try {
      usdValue = await toUsd(parsed.data.price, localCurrency);
    } catch {
      // If FX fails, fall back to raw amount and warn — still safe to use threshold.
    }
    const isExpensive = usdValue >= USD_REVIEW_THRESHOLD;

    // Expensive items require an approved KYC submission
    if (isExpensive) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: kyc } = await (supabase.from("kyc_submissions") as any)
        .select("status")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();
      if (!kyc) {
        setBusy(false);
        toast.error(
          `Listings over ${formatMoney(USD_REVIEW_THRESHOLD, "USD")} require identity verification. Please complete KYC first.`,
        );
        navigate({ to: "/kyc" });
        return;
      }
    }

    try {
      const photoUrls: string[] = [];
      for (const f of photos) {
        const path = `${user.id}/${Date.now()}-${f.name.replace(/\s+/g, "_")}`;
        const { error } = await supabase.storage.from("products").upload(path, f);
        if (error) throw error;
        photoUrls.push(supabase.storage.from("products").getPublicUrl(path).data.publicUrl);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("products") as any).insert({
        seller_id: user.id,
        title: parsed.data.title,
        price: parsed.data.price,
        currency: localCurrency,
        description: parsed.data.description,
        condition,
        category: parsed.data.category,
        location: `${verifiedCity || "—"}, ${verifiedCountry}`,
        shipping_available: shipping,
        photos: photoUrls,
        status: isExpensive ? "pending_review" : "active",
      });
      if (error) throw error;
      // Record timestamp for rate-limiting
      const RATE_KEY = "sellora_post_timestamps";
      const nowTs = Date.now();
      const storedTs = JSON.parse(localStorage.getItem(RATE_KEY) || "[]") as number[];
      storedTs.push(nowTs);
      localStorage.setItem(RATE_KEY, JSON.stringify(storedTs.filter((t) => nowTs - t < 120_000)));
      void recordEvent({
        type: "post",
        content: `${parsed.data.title}\n\n${parsed.data.description ?? ""}`,
        userId: user.id,
        metadata: { category: parsed.data.category, price: parsed.data.price },
      });
      toast.success(
        isExpensive
          ? "Submitted for review — your listing will appear once an admin approves it."
          : "Product listed!",
      );
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to list product");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AppLayout><p className="text-sm text-muted-foreground">Loading…</p></AppLayout>;
  if (!user) return <AppLayout><GuestGate message="Sign in to list a product for sale." /></AppLayout>;

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Sell Product</h1>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Upload up to 3 photos. Free accounts: 3 products/day. Boosted: unlimited.</p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Photos (up to 3)</p>
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg border border-border">
                <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-card/90 p-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 3 && (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
                <ImageIcon className="h-5 w-5" />
                <span className="mt-1 text-xs">Add</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addPhotos(e.target.files)} />
        </div>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Samsung Galaxy S24" maxLength={120} className="input" />
        </Field>
        <Field label="Price (KES)">
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="input" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your product..." maxLength={1000} rows={4} className="input min-h-[100px] py-2" />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Condition</p>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button key={c.v} type="button" onClick={() => setCondition(c.v)} className={`rounded-full px-4 py-1.5 text-sm ${condition === c.v ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <div className={`rounded-lg border p-3 ${geoConfirmed || manualMode ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-card"}`}>
          <p className="mb-1 flex items-center gap-1 text-sm font-medium">
            {manualMode ? "Enter listing location" : "Verify listing location"} <span className="text-primary">*</span>
            {geoConfirmed && !manualMode && <CheckCircle2 className="h-4 w-4 text-success" />}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {manualMode
              ? "GPS unavailable — select your country and city manually. Listings may be reviewed for location accuracy."
              : "We re-check your GPS at every post to prevent fake locations."}
          </p>
          {!manualMode && (
            <button type="button" onClick={detectLocation} disabled={geoBusy} className="flex w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {geoConfirmed ? "Re-verify my location" : "Use my current location"}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setManualMode(!manualMode); setGeoConfirmed(false); }}
            className="mt-2 w-full rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
          >
            {manualMode ? "← Use GPS instead" : "GPS slow? Enter location manually"}
          </button>
          {country && !manualMode && (
            <p className="mt-2 text-xs"><strong>Country:</strong> {country} <span className="text-muted-foreground">(locked)</span></p>
          )}
        </div>

        {manualMode ? (
          <Field label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
              <option value="">Select country…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        ) : null}

        <Field label="City / area">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Nairobi" className="input" disabled={!geoConfirmed && !manualMode} />
        </Field>

        <label className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <span className="text-sm font-medium">Shipping available?</span>
          <input type="checkbox" checked={shipping} onChange={(e) => setShipping(e.target.checked)} className="h-5 w-5" />
        </label>

        <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-60">
          <Upload className="h-4 w-4" /> {busy ? "Verifying & Listing..." : "List Product"}
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
