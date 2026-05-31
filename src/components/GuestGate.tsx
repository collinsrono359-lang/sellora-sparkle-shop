import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

export function GuestGate({ message = "Sign in to continue" }: { message?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-lg border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <h2 className="mb-1 text-lg font-bold">Members only</h2>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      <Link
        to="/auth"
        className="inline-flex h-10 items-center justify-center rounded-md bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground"
      >
        Sign in or create account
      </Link>
      <p className="mt-3 text-xs text-muted-foreground">
        Guests can browse products, but selling, messaging, payments, and saving require an account.
      </p>
    </div>
  );
}
