// Tiny theme manager — applies the chosen theme to <html> immediately and on system changes.
export type ThemeChoice = "light" | "dark" | "system";

let mql: MediaQueryList | null = null;
let listener: ((e: MediaQueryListEvent) => void) | null = null;

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const setDark = (on: boolean) => root.classList.toggle("dark", on);

  // Tear down previous system listener
  if (mql && listener) { mql.removeEventListener("change", listener); mql = null; listener = null; }

  if (choice === "dark") setDark(true);
  else if (choice === "light") setDark(false);
  else {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mql.matches);
    listener = (e) => setDark(e.matches);
    mql.addEventListener("change", listener);
  }
  try { localStorage.setItem("theme", choice); } catch { /* ignore */ }
}

export function loadInitialTheme() {
  if (typeof window === "undefined") return;
  let choice: ThemeChoice = "system";
  try {
    const fromTheme = localStorage.getItem("theme") as ThemeChoice | null;
    if (fromTheme) choice = fromTheme;
    else {
      const prefs = localStorage.getItem("prefs");
      if (prefs) {
        const p = JSON.parse(prefs);
        if (p.theme) choice = p.theme;
      }
    }
  } catch { /* ignore */ }
  applyTheme(choice);
}
