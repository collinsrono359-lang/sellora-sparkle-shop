import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url,display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        setAvatar(data?.avatar_url ?? null);
        setName(data?.display_name ?? "");
      });
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="mx-auto flex max-w-screen-md items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" aria-hidden />
          <span className="text-xl font-bold text-primary">Sellora</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/notifications"
            className="relative rounded-full p-2 hover:bg-secondary"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unread > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-primary px-1 text-[10px]">
                {unread > 9 ? "9+" : unread}
              </Badge>
            )}
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary"
                aria-label="Account menu"
              >
                <Avatar className="block h-10 w-10 shrink-0 rounded-full">
                  <AvatarImage src={avatar ?? undefined} alt={name} className="h-10 w-10 rounded-full object-cover" />
                  <AvatarFallback className="h-10 w-10 rounded-full text-sm">
                    {(name || user.email || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{name || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>Edit Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/saved" })}>Saved</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
