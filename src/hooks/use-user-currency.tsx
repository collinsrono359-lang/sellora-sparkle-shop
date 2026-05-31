import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { currencyForCountry, convert } from "@/lib/currency";

// Returns the user's preferred display currency (based on profile country)
// and a converter that turns any amount in another currency into that one.
export function useUserCurrency() {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<string>("USD");

  useEffect(() => {
    if (!user) {
      // Fall back to browser locale region
      try {
        const region = new Intl.Locale(navigator.language).maximize().region ?? "";
        const browserMap: Record<string, string> = {
          US: "USD", GB: "GBP", KE: "KES", NG: "NGN", ZA: "ZAR", IN: "INR",
          DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", AU: "AUD", CA: "CAD",
          JP: "JPY", CN: "CNY", BR: "BRL", MX: "MXN",
        };
        if (browserMap[region]) setCurrency(browserMap[region]);
      } catch { /* ignore */ }
      return;
    }
    void (async () => {
      const { data } = await supabase.from("profiles").select("country").eq("user_id", user.id).maybeSingle();
      setCurrency(currencyForCountry(data?.country));
    })();
  }, [user]);

  return {
    currency,
    convertTo: async (amount: number, from: string) => convert(amount, from, currency),
  };
}
