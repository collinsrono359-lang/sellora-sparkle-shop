import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { describeGeoError, requestGeolocation } from "@/lib/geo";
import { ArrowLeft, Camera, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

const ProfileSchema = z.object({
  display_name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  country: z.string().trim().min(1, "Country is required"),
  location: z.string().trim().max(100).optional().default(""),
  bio: z.string().trim().max(300).optional().default(""),
});

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Edit profile — Sellora" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState(""); // GPS-locked
  const [location, setLocation] = useState(""); // editable
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoConfirmed, setGeoConfirmed] = useState(false);

  const detectLocation = async () => {
    setGeoBusy(true);
    try {
      const g = await requestGeolocation();
      setCountry(g.country);
      setLocation(g.city || "");
      setGeoConfirmed(true);
      toast.success(`Location verified: ${g.city ? g.city + ", " : ""}${g.country}`);
    } catch (e) {
      toast.error(describeGeoError(e));
    } finally {
      setGeoBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (user) {
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setName(data.display_name ?? "");
          setCountry(data.country ?? "");
          setLocation(data.location ?? "");
          setBio(data.bio ?? "");
          setPreview(data.avatar_url ?? null);
          if (data.country) setGeoConfirmed(true);
        }
      });
    }
  }, [user, loading, navigate]);

  const onPhoto = (f: File) => {
    setPhotoFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!geoConfirmed || !country) return toast.error("Please tap 'Use my current location' to verify your country");
    const parsed = ProfileSchema.safeParse({
      display_name: name,
      country,
      location,
      bio,
    });
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Please check your inputs");
    }
    setBusy(true);
    try {
      let avatar_url: string | null = preview;
      if (photoFile) {
        const path = `${user.id}/${Date.now()}-${photoFile.name.replace(/\s+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, photoFile, { upsert: true });
        if (upErr) throw upErr;
        avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: parsed.data.display_name,
            country: parsed.data.country,
            location: parsed.data.location,
            bio: parsed.data.bio,
            avatar_url,
          },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      toast.success("Profile saved!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-screen-md bg-background px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/dashboard" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-foreground">Edit your profile</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">Tell buyers and sellers a bit about you.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-border bg-secondary"
            aria-label="Upload photo"
          >
            {preview ? (
              <img src={preview} alt="Preview" className="h-full w-full rounded-full object-cover" />
            ) : (
              <Camera className="m-auto mt-7 h-8 w-8 text-muted-foreground" />
            )}
          </button>
          <div>
            <p className="text-sm font-medium">Profile photo</p>
            <p className="text-xs text-muted-foreground">JPG or PNG, up to 5 MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        </div>

        <Field label="Full name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="input" />
        </Field>

        <div className={`rounded-lg border p-3 ${geoConfirmed ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-card"}`}>
          <p className="mb-1 flex items-center gap-1 text-sm font-medium">
            Verify your location <span className="text-primary">*</span>
            {geoConfirmed && <CheckCircle2 className="h-4 w-4 text-success" />}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Your country is locked from device GPS to keep the marketplace honest. You can refine the city below.
          </p>
          <button
            type="button"
            onClick={detectLocation}
            disabled={geoBusy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[image:var(--gradient-primary)] py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {geoConfirmed ? "Re-detect my location" : "Use my current location"}
          </button>
        </div>

        <Field label="Country (locked to GPS)" required>
          <input value={country} readOnly placeholder="Tap 'Use my current location' above" className="input cursor-not-allowed bg-muted text-muted-foreground" />
        </Field>

        <Field label="City / area (you can refine)" required>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} required disabled={!geoConfirmed} placeholder="e.g. Rongai" className="input" />
        </Field>

        <Field label="Bio">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} className="input min-h-[88px] py-2" />
        </Field>

        <button disabled={busy || !geoConfirmed} className="h-12 w-full rounded-md bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Saving..." : "Save profile"}
        </button>
      </form>

      <style>{`.input{height:44px;width:100%;border:1px solid var(--border);background:var(--card);border-radius:8px;padding:0 12px;font-size:14px;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      {children}
    </label>
  );
}
