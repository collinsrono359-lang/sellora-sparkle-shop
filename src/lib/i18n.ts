// Tiny i18n helper for UI labels. Persistent via localStorage and re-applied on app load.
export type LangCode = "en" | "sw" | "fr" | "ar" | "es";

type Dict = Record<string, string>;

const DICTS: Record<LangCode, Dict> = {
  en: {
    preferences: "Preferences",
    language: "Language",
    region_currency: "Region & Currency",
    appearance: "Appearance",
    save_preferences: "Save preferences",
    prefs_saved: "Preferences saved",
    privacy_settings: "Privacy Settings",
    save: "Save",
  },
  sw: {
    preferences: "Mapendeleo",
    language: "Lugha",
    region_currency: "Mkoa & Sarafu",
    appearance: "Mwonekano",
    save_preferences: "Hifadhi mapendeleo",
    prefs_saved: "Mapendeleo yamehifadhiwa",
    privacy_settings: "Mipangilio ya Faragha",
    save: "Hifadhi",
  },
  fr: {
    preferences: "Préférences",
    language: "Langue",
    region_currency: "Région & Devise",
    appearance: "Apparence",
    save_preferences: "Enregistrer",
    prefs_saved: "Préférences enregistrées",
    privacy_settings: "Confidentialité",
    save: "Enregistrer",
  },
  ar: {
    preferences: "التفضيلات",
    language: "اللغة",
    region_currency: "المنطقة والعملة",
    appearance: "المظهر",
    save_preferences: "حفظ التفضيلات",
    prefs_saved: "تم حفظ التفضيلات",
    privacy_settings: "إعدادات الخصوصية",
    save: "حفظ",
  },
  es: {
    preferences: "Preferencias",
    language: "Idioma",
    region_currency: "Región y Moneda",
    appearance: "Apariencia",
    save_preferences: "Guardar preferencias",
    prefs_saved: "Preferencias guardadas",
    privacy_settings: "Privacidad",
    save: "Guardar",
  },
};

let current: LangCode = "en";

export function setLanguage(code: LangCode) {
  current = DICTS[code] ? code : "en";
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", current);
    document.documentElement.setAttribute("dir", current === "ar" ? "rtl" : "ltr");
  }
  try { localStorage.setItem("lang", current); } catch { /* ignore */ }
}

export function getLanguage(): LangCode { return current; }

export function loadInitialLanguage() {
  if (typeof window === "undefined") return;
  try {
    const fromLang = localStorage.getItem("lang") as LangCode | null;
    if (fromLang && DICTS[fromLang]) { setLanguage(fromLang); return; }
    const prefs = localStorage.getItem("prefs");
    if (prefs) {
      const p = JSON.parse(prefs);
      if (p.lang && DICTS[p.lang as LangCode]) { setLanguage(p.lang); return; }
    }
  } catch { /* ignore */ }
  setLanguage("en");
}

export function t(key: string): string {
  return DICTS[current]?.[key] ?? DICTS.en[key] ?? key;
}
