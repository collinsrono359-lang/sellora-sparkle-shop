import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-2 bg-warning px-4 py-2 text-sm text-foreground">
      <span className="flex items-center gap-2">
        <WifiOff className="h-4 w-4" /> You're offline. Changes will sync when reconnected.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-card px-3 py-1 text-xs font-medium"
      >
        Retry
      </button>
    </div>
  );
}
