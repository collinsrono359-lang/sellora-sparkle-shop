import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BadgeCheck, Camera, CheckCircle2, Clock, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/kyc")({
  head: () => ({ meta: [{ title: "Identity Verification — Sellora" }] }),
  component: KYC,
});

type Status = "none" | "pending" | "approved" | "rejected";

function KYC() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState<Status>("none");
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState<"national_id" | "passport" | "drivers_license">("national_id");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("verified").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setVerified(!!data?.verified));
    supabase.from("kyc_submissions").select("status,notes").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as Status);
          setNotes(data.notes ?? null);
        }
      });
  }, [user]);

  const upload = async (file: File, kind: string) => {
    if (!user) throw new Error("Not signed in");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("kyc").upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!user) return;
    if (!front) {
      toast.error("Please upload the front of your ID");
      return;
    }
    setBusy(true);
    try {
      const id_front_path = await upload(front, "front");
      const id_back_path = back ? await upload(back, "back") : null;
      const selfie_path = selfie ? await upload(selfie, "selfie") : null;
      const { error } = await supabase.from("kyc_submissions").insert({
        user_id: user.id,
        id_front_path,
        id_back_path,
        selfie_path,
        document_type: docType,
        status: "pending",
      });
      if (error) throw error;
      setStatus("pending");
      setFront(null);
      setBack(null);
      setSelfie(null);
      toast.success("Submitted! We'll review within 24 hours.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Identity Verification (KYC)</h1>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <BadgeCheck className={`h-5 w-5 ${verified ? "text-primary" : "text-muted-foreground"}`} />
          <p className="font-semibold">
            {verified ? "You are verified" : status === "pending" ? "Under review" : status === "rejected" ? "Rejected" : "Not submitted"}
          </p>
          {status === "pending" && <Clock className="h-4 w-4 text-warning" />}
          {status === "approved" && <CheckCircle2 className="h-4 w-4 text-primary" />}
          {status === "rejected" && <XCircle className="h-4 w-4 text-destructive" />}
        </div>
        <p className="text-xs text-muted-foreground">
          KYC submission is <strong>free</strong>. Verified badge requires a one-time fee on the Payments page after approval.
        </p>
        {notes && status === "rejected" && (
          <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">Reviewer note: {notes}</p>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 font-semibold">Why verify?</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Builds trust with buyers — verified sellers earn up to 3× more</li>
          <li>• Required to unlock high-value listing categories</li>
          <li>• Eligibility for buyer-protection program</li>
          <li>• Faster dispute resolution and account recovery</li>
          <li>• Reduced commission on completed sales</li>
        </ul>
      </div>

      {status !== "approved" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">1. Document type</p>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as typeof docType)}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="national_id">National ID</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's License</option>
            </select>
          </div>

          <FilePick label="2. Front of ID (required)" file={front} onPick={setFront} icon={Upload} />
          <FilePick label="3. Back of ID (optional)" file={back} onPick={setBack} icon={Upload} />
          <FilePick label="4. Selfie holding your ID (recommended)" file={selfie} onPick={setSelfie} icon={Camera} />

          <button
            disabled={busy || !front}
            onClick={submit}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? "Uploading…" : "Submit for review (free)"}
          </button>
        </div>
      )}

      {status === "approved" && !verified && (
        <Link
          to="/payments"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground"
        >
          <BadgeCheck className="h-4 w-4" /> Pay for verified badge
        </Link>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        🔒 Your documents are stored privately and only seen by Sellora reviewers. We never share your ID.
      </p>
    </AppLayout>
  );
}

function FilePick({
  label,
  file,
  onPick,
  icon: Icon,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="line-clamp-1">{file ? file.name : "Choose photo (JPG/PNG)"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}
