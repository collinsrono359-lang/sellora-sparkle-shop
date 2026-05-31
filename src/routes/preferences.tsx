import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, type ThemeChoice } from "@/lib/theme";
import { setLanguage, t, type LangCode } from "@/lib/i18n";

export const Route = createFileRoute("/preferences")({
  head: () => ({ meta: [{ title: "Preferences — Sellora" }] }),
  component: PreferencesPage,
});

const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "sw", label: "Swahili" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
];
const REGIONS = [
  { label: "Kenya (KES)", code: "KES" },
  { label: "Uganda (UGX)", code: "UGX" },
  { label: "Tanzania (TZS)", code: "TZS" },
  { label: "Nigeria (NGN)", code: "NGN" },
  { label: "United States (USD)", code: "USD" },
];
const THEMES: ThemeChoice[] = ["light", "dark", "system"];

function PreferencesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<LangCode>("en");
  const [region, setRegion] = useState("KES");
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load — first localStorage (instant), then DB (authoritative)
  useEffect(() => {
    const local = localStorage.getItem("prefs");
    if (local) {
      try {
        const p = JSON.parse(local);
        if (p.lang) setLang(p.lang);
        if (p.region) setRegion(p.region);
        if (p.theme) setTheme(p.theme);
      } catch { /* ignore */ }
    }
    if (!user) { setLoaded(true); return; }
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        const langMap: Record<string, LangCode> = { English: "en", Swahili: "sw", French: "fr", Arabic: "ar", Spanish: "es" };
        const code = (langMap[data.language] || (data.language as LangCode)) as LangCode;
        setLang(code);
        setRegion(data.region);
        setTheme(data.theme as ThemeChoice);
      }
      setLoaded(true);
    });
  }, [user]);

  // Live apply on change
  useEffect(() => { if (loaded) applyTheme(theme); }, [theme, loaded]);
  useEffect(() => { if (loaded) setLanguage(lang); }, [lang, loaded]);

  const save = async () => {
    setBusy(true);
    localStorage.setItem("prefs", JSON.stringify({ lang, region, theme }));
    if (user) {
      const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || "English";
      const { error } = await supabase.from("user_preferences").upsert(
        { user_id: user.id, language: langLabel, region, theme },
        { onConflict: "user_id" }
      );
      if (error) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
    }
    toast.success(t("prefs_saved"));
    setBusy(false);
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("preferences")}</h1>
      </div>

      <Section title={t("language")}>
        {LANGUAGES.map((l) => (
          <Row key={l.code} label={l.label} active={lang === l.code} onClick={() => setLang(l.code)} />
        ))}
      </Section>

      <Section title={t("region_currency")}>
        {REGIONS.map((r) => (
          <Row key={r.code} label={r.label} active={region === r.code} onClick={() => setRegion(r.code)} />
        ))}
      </Section>

      <Section title={t("appearance")}>
        {THEMES.map((tCh) => (
          <Row key={tCh} label={tCh[0].toUpperCase() + tCh.slice(1)} active={theme === tCh} onClick={() => setTheme(tCh)} />
        ))}
      </Section>

      <button
        onClick={save}
        disabled={busy}
        className="mt-2 mb-10 flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("save_preferences")}
      </button>
    </AppLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{title.toUpperCase()}</h2>
      <ul className="overflow-hidden rounded-lg border border-border bg-card">{children}</ul>
    </section>
  );
}

function Row({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left text-sm last:border-b-0">
        <span>{label}</span>
        {active && <Check className="h-4 w-4 text-primary" />}
      </button>
    </li>
  );
}
