import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns the set of seller IDs the current user has blocked.
 * Returns an empty set for guests.
 */
export function useBlockedSellers() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setBlocked(new Set());
      return;
    }
    supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .then(({ data }) => {
        setBlocked(new Set((data ?? []).map((r) => r.blocked_id)));
      });
  }, [user]);

  return blocked;
}
