// PWA service worker registration with iframe + preview-host guard.
// Lovable preview iframes must NOT register the SW.
export function registerPwa() {
  if (typeof window === "undefined") return;

  const isIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isPreview =
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovableproject-dev.com");

  if (isIframe || isPreview) {
    // Clean up any previously registered SW so old caches don't pollute previews.
    void navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
    return;
  }

  // Dynamic import so the virtual module is only pulled in production builds.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => { /* virtual module unavailable in dev */ });
}
