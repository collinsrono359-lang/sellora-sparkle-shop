import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { recordEvent } from "@/lib/moderation-client";
import { isDisposableEmail } from "@/lib/disposable-emails";
import { checkSignupAllowed, recordSignupSuccess } from "@/lib/signup-guard.functions";
import { Store } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in or sign up — Sellora" }] }),
  component: AuthPage,
});

const OTP_LENGTH = 8;

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "otp" | "reset-sent">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deviceBlocked, setDeviceBlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sellora_device_signup_blocked") === "1";
  });
  const [showWhy, setShowWhy] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const checkAllowed = useServerFn(checkSignupAllowed);
  const recordSuccess = useServerFn(recordSignupSuccess);

  // Generate / read a stable device fingerprint (also stored by moderation-client).
  const getFingerprint = (): string => {
    if (typeof window === "undefined") return "ssr";
    const key = "sellora_device_fp";
    let fp = localStorage.getItem(key);
    if (!fp) {
      const seed = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}|${Math.random().toString(36).slice(2)}`;
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
      fp = `fp_${Math.abs(h).toString(36)}_${Date.now().toString(36)}`;
      localStorage.setItem(key, fp);
    }
    return fp;
  };

  const getIp = async (): Promise<string | null> => {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json();
      return j.ip ?? null;
    } catch { return null; }
  };

  useEffect(() => {
    if (!loading && user) {
      (async () => {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = (data ?? []).some((r) => r.role === "admin" || r.role === "moderator");
        navigate({ to: isAdmin ? "/admin" : "/onboarding" });
      })();
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < OTP_LENGTH; i++) next[i] = text[i] || "";
    setOtp(next);
    const focusIdx = Math.min(text.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (isDisposableEmail(email)) {
          toast.error("Disposable/temporary email addresses are not allowed. Please use a permanent email.");
          setBusy(false);
          return;
        }

        // Device-based signup throttle: max 2 accounts per device.
        const fingerprint = getFingerprint();
        const ip = await getIp();
        const guard = await checkAllowed({ data: { email, fingerprint, ip } });
        if (!guard.allowed) {
          if (typeof window !== "undefined") localStorage.setItem("sellora_device_signup_blocked", "1");
          setDeviceBlocked(true);
          if (guard.warning) {
            toast.error(guard.message, { duration: 8000 });
          } else {
            toast.error(guard.message);
          }
          setMode("signin");
          setBusy(false);
          return;
        }

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;
        if (signUpData.user?.id) {
          void recordSuccess({ data: { email, fingerprint, ip, userId: signUpData.user.id } });
        }
        toast.success("Account created! Enter the verification code sent to your email.");
        setMode("otp");
        setOtp(Array(OTP_LENGTH).fill(""));
        setResendCooldown(60);
      } else if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const uid = data.user?.id ?? null;
        void recordEvent({ type: "login", userId: uid, metadata: { email } });
        toast.success("Welcome back!");
      } else if (mode === "forgot") {
        if (isDisposableEmail(email)) {
          toast.error("Disposable email addresses are not allowed.");
          setBusy(false);
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMode("reset-sent");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length < OTP_LENGTH) {
      toast.error("Please enter the complete verification code.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      const uid = data.user?.id ?? null;
      void recordEvent({ type: "signup", userId: uid, metadata: { email } });
      toast.success("Email verified! Welcome to Sellora.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw error;
      toast.success("New code sent to your email.");
      setResendCooldown(60);
      setOtp(Array(OTP_LENGTH).fill(""));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend code.");
    } finally {
      setBusy(false);
    }
  };

  // OTP verification screen
  if (mode === "otp") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-soft)] px-4">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <Store className="h-7 w-7 text-primary" />
          <span className="text-2xl font-bold text-primary">Sellora</span>
        </Link>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="mb-1 text-lg font-bold">Verify your email</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter the {OTP_LENGTH}-digit code sent to <strong>{email}</strong>
          </p>
          <div className="mb-4 flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="h-12 w-10 rounded-md border border-border bg-background text-center text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
              />
            ))}
          </div>
          <button
            onClick={verifyOtp}
            disabled={busy}
            className="mb-3 h-11 w-full rounded-md bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <div className="text-center">
            <button
              onClick={resendOtp}
              disabled={busy || resendCooldown > 0}
              className="text-sm text-primary underline disabled:text-muted-foreground disabled:no-underline"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>
          <button
            onClick={() => setMode("signin")}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // Password reset link sent screen
  if (mode === "reset-sent") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-soft)] px-4">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <Store className="h-7 w-7 text-primary" />
          <span className="text-2xl font-bold text-primary">Sellora</span>
        </Link>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="mb-1 text-lg font-bold">Check your email</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            We sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Didn't receive it? Check your spam folder or try again.
          </p>
          <button
            onClick={() => setMode("forgot")}
            className="mb-2 h-11 w-full rounded-md border border-border bg-secondary text-sm font-medium hover:bg-accent"
          >
            Try again
          </button>
          <button
            onClick={() => setMode("signin")}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // Forgot password screen
  if (mode === "forgot") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-soft)] px-4">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <Store className="h-7 w-7 text-primary" />
          <span className="text-2xl font-bold text-primary">Sellora</span>
        </Link>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="mb-1 text-lg font-bold">Forgot password?</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              disabled={busy}
              className="h-11 w-full rounded-md bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <button
            onClick={() => setMode("signin")}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // Sign in / Sign up screen
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-soft)] px-4">
      <Link to="/" className="mb-6 flex items-center gap-2">
        <Store className="h-7 w-7 text-primary" />
        <span className="text-2xl font-bold text-primary">Sellora</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <div className="mb-2 flex rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mode === "signin" ? "bg-card shadow" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { if (!deviceBlocked) setMode("signup"); }}
            disabled={deviceBlocked}
            aria-disabled={deviceBlocked}
            title={deviceBlocked ? "Account limit reached for this device" : undefined}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mode === "signup" ? "bg-card shadow" : "text-muted-foreground"} ${deviceBlocked ? "cursor-not-allowed opacity-50" : ""}`}
          >
            Sign up
          </button>
        </div>
        {deviceBlocked && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-semibold text-amber-700 dark:text-amber-300">⚠️ Account limit reached for this device</p>
              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              >
                Why?
              </button>
            </div>
            {showWhy && (
              <p className="mb-2 text-muted-foreground">
                This limit prevents spam and fake listings.
              </p>
            )}
            <p className="text-muted-foreground">You can only create 2 accounts per device. You already have 2 accounts registered.</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>✅ You can still sign in to your existing accounts</li>
              <li>❌ Creating new accounts is disabled on this device</li>
            </ul>
            <p className="mt-2">
              Need more accounts for business?{" "}
              <Link to="/contact" className="font-semibold text-primary underline">
                Contact support
              </Link>
            </p>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {mode === "signin" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-xs text-primary underline"
              >
                Forgot password?
              </button>
            </div>
          )}
          <button
            disabled={busy}
            className="h-11 w-full rounded-md bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
