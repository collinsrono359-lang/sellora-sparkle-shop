import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert, CheckCircle2, XCircle, Clock, Upload } from "lucide-react";
import { toast } from "sonner";

interface Appeal {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string;
  admin_response: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Flag {
  id: string;
  severity: string;
  category: string;
  reason: string;
  created_at: string;
}

function formatRemaining(until: string): string {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

export function SuspensionAppealModal() {
  const { user } = useAuth();
  const [suspendedUntil, setSuspendedUntil] = useState<string | null>(null);
  const [warningCount, setWarningCount] = useState<number>(0);
  const [permanentBan, setPermanentBan] = useState<boolean>(false);
  const [latestFlag, setLatestFlag] = useState<Flag | null>(null);
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [open, setOpen] = useState(false);
  const [appealing, setAppealing] = useState(false);
  const [text, setText] = useState("");
  const [fullName, setFullName] = useState("");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [termsRead, setTermsRead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decisionShown, setDecisionShown] = useState<Appeal | null>(null);
  const [, tick] = useState(0);

  const isCritical = permanentBan || warningCount >= 2;

  // tick for countdown
  useEffect(() => {
    if (!suspendedUntil) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [suspendedUntil]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prof } = await (supabase.from("profiles") as any)
        .select("suspended_until, warning_count, permanent_ban")
        .eq("user_id", user.id)
        .maybeSingle();
      const until = (prof?.suspended_until as string | null) ?? null;
      const isSusp = !!until && new Date(until) > new Date();
      if (!mounted) return;
      setSuspendedUntil(isSusp ? until : null);
      setWarningCount((prof?.warning_count as number | null) ?? 0);
      setPermanentBan(!!prof?.permanent_ban);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: flag } = await (supabase.from("moderation_flags" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestFlag((flag as Flag | null) ?? null);

      // Only consider an appeal that is tied to the current (latest) flag, so a
      // previously approved/rejected appeal doesn't block creating a fresh one
      // when the user is suspended again later.
      const latestFlagId = (flag as Flag | null)?.id ?? null;
      let appealQuery = (supabase.from("moderation_appeals" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (latestFlagId) appealQuery = appealQuery.eq("flag_id", latestFlagId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ap } = await appealQuery.maybeSingle();
      setAppeal((ap as Appeal | null) ?? null);

      if (isSusp) setOpen(true);
    };

    void load();

    const channel = supabase
      .channel(`susp-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newUntil = (payload.new as any)?.suspended_until as string | null;
          const isSusp = !!newUntil && new Date(newUntil) > new Date();
          setSuspendedUntil(isSusp ? newUntil : null);
          if (!isSusp) {
            // unsuspended — close suspension modal, decision modal handles UX
            setOpen(false);
          } else {
            setOpen(true);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "moderation_appeals", filter: `user_id=eq.${user.id}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const next = payload.new as any as Appeal;
          setAppeal(next);
          if (next.status === "approved" || next.status === "rejected") {
            setDecisionShown(next);
            if (next.status === "approved") {
              toast.success("Your appeal was approved — full access restored.");
            } else {
              toast.error("Your appeal was rejected.");
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "moderation_flags", filter: `user_id=eq.${user.id}` },
        (payload) => setLatestFlag(payload.new as Flag)
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const submitAppeal = async () => {
    if (!user) return;
    if (text.trim().length < 20) {
      toast.error("Please explain in at least 20 characters.");
      return;
    }
    if (!termsRead) {
      toast.error("Please confirm you've read the Terms & Conditions.");
      return;
    }
    if (isCritical) {
      if (fullName.trim().length < 3) {
        toast.error("Please enter your full legal name.");
        return;
      }
      if (!selfieFile) {
        toast.error("A selfie is required for a critical appeal.");
        return;
      }
    }
    setSubmitting(true);

    let selfiePath: string | null = null;
    if (selfieFile) {
      const { compressImage } = await import("@/lib/image");
      const compressed = await compressImage(selfieFile, { maxDim: 1600, quality: 0.88 });
      const ext = compressed.name.split(".").pop() || "jpg";
      const path = `${user.id}/appeal-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("kyc").upload(path, compressed, { upsert: true });
      if (upErr) {
        setSubmitting(false);
        toast.error(upErr.message);
        return;
      }
      selfiePath = path;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("moderation_appeals" as any) as any)
      .insert({
        user_id: user.id,
        flag_id: latestFlag?.id ?? null,
        message: text.trim(),
        is_critical: isCritical,
        full_name: isCritical ? fullName.trim() : null,
        selfie_path: selfiePath,
        terms_accepted: true,
      })
      .select("*")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAppeal(data as Appeal);
    setAppealing(false);
    setText("");
    setFullName("");
    setSelfieFile(null);
    setTermsRead(false);
    toast.success(isCritical ? "Critical appeal submitted with your proofs." : "Appeal submitted. We'll review it shortly.");
  };

  const remaining = useMemo(() => (suspendedUntil ? formatRemaining(suspendedUntil) : null), [suspendedUntil]);

  if (!user) return null;

  // ---------- Decision modal (approved/rejected) ----------
  if (decisionShown) {
    const approved = decisionShown.status === "approved";
    return (
      <Dialog open onOpenChange={() => setDecisionShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approved ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Appeal approved
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Appeal rejected
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {approved
                ? "Your account has been fully restored. You can post, message, and use Sellora normally again."
                : "Our team reviewed your appeal but decided to keep the restriction in place."}
            </DialogDescription>
          </DialogHeader>
          {decisionShown.admin_response && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-semibold">Reviewer note</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{decisionShown.admin_response}</p>
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setDecisionShown(null)}
              className="h-10 rounded-md bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground"
            >
              {approved ? "Continue" : "Got it"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- Suspension modal ----------
  if (!suspendedUntil) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Account suspended
          </DialogTitle>
          <DialogDescription>
            Your account is temporarily restricted by Sellora's safety system. You can still browse, but messaging and
            posting are paused.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-semibold">Lifts at {new Date(suspendedUntil).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{remaining}</p>
            </div>
          </div>

          {latestFlag && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Reason · {latestFlag.category.replace("_", " ")}
              </p>
              <p className="text-sm">{latestFlag.reason}</p>
            </div>
          )}

          {appeal?.status === "pending" ? (
            <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm">
              <p className="font-semibold">Appeal under review</p>
              <p className="text-xs text-muted-foreground">
                Submitted {new Date(appeal.created_at).toLocaleString()}. You'll be notified instantly when reviewed.
              </p>
            </div>
          ) : appealing ? (
            <div className="space-y-2">
              {isCritical && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                  <p className="font-semibold text-destructive">Critical appeal required</p>
                  <p className="text-muted-foreground">
                    Repeat violation detected. Provide your full legal name, a selfie, and complete{" "}
                    <Link to="/kyc" className="font-semibold text-primary underline">KYC verification</Link>.
                  </p>
                </div>
              )}
              <label className="block text-xs font-semibold">Tell us why this is a mistake</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Explain what happened and provide proofs…"
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-right text-[10px] text-muted-foreground">{text.length}/1000</p>

              {isCritical && (
                <>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full legal name"
                    className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background p-2 text-xs">
                    <Upload className="h-4 w-4" />
                    <span className="flex-1 truncate">{selfieFile?.name ?? "Upload selfie holding your ID"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}

              <label className="flex items-start gap-2 pt-1 text-xs">
                <input
                  type="checkbox"
                  checked={termsRead}
                  onChange={(e) => setTermsRead(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  I have read and agree to the{" "}
                  <Link to="/legal/$doc" params={{ doc: "terms" }} className="font-semibold text-primary underline">
                    Terms & Conditions
                  </Link>{" "}
                  and understand repeated violations lead to a permanent 120-day ban.
                </span>
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isCritical
                ? "Repeat violation — a critical appeal with proofs and KYC is required."
                : "Believe this is a mistake? Submit an appeal — a human reviewer will look at it."}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {appeal?.status !== "pending" &&
            (appealing ? (
              <>
                <button
                  onClick={() => {
                    setAppealing(false);
                    setText("");
                  }}
                  className="h-10 rounded-md border border-border px-4 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={submitAppeal}
                  className="h-10 rounded-md bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Submit appeal"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setAppealing(true)}
                className="h-10 rounded-md bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground"
              >
                Appeal suspension
              </button>
            ))}
          <button onClick={() => setOpen(false)} className="h-10 rounded-md border border-border px-4 text-sm font-medium">
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
