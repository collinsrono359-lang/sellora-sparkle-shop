import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { loadInitialTheme } from "@/lib/theme";
import { loadInitialLanguage } from "@/lib/i18n";
import { useNotifications } from "@/hooks/use-notifications";
import { registerPwa } from "@/lib/pwa";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sellora app" },
      { name: "description", content: "Sellora is a global marketplace where you can list, discover and buy products from verified sellers worldwide." },
      { name: "author", content: "Sellora" },
      { property: "og:title", content: "Sellora app" },
      { property: "og:description", content: "Sellora is a global marketplace where you can list, discover and buy products from verified sellers worldwide." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sellora app" },
      { name: "twitter:description", content: "Sellora is a global marketplace where you can list, discover and buy products from verified sellers worldwide." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fde31d10-dddc-4ff4-9253-bf59d4a12e6a/id-preview-0a921cac--c212fd4d-3a5b-4883-ac93-46692b58fdbd.lovable.app-1776811329360.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fde31d10-dddc-4ff4-9253-bf59d4a12e6a/id-preview-0a921cac--c212fd4d-3a5b-4883-ac93-46692b58fdbd.lovable.app-1776811329360.png" },
      { name: "theme-color", content: "#0b69ff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Sellora" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    loadInitialTheme();
    loadInitialLanguage();
    registerPwa();
  }, []);
  return (
    <AuthProvider>
      <NotificationsBridge />
      <Outlet />
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}

function NotificationsBridge() {
  useNotifications();
  return null;
}
