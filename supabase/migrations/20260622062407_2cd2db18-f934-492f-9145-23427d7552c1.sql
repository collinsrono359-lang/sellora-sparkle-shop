
ALTER TABLE public.developer_apps
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'live'
    CHECK (mode IN ('live','test'));

ALTER TABLE public.api_payments
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'live'
    CHECK (mode IN ('live','test'));

CREATE OR REPLACE FUNCTION public.credit_wallet_on_api_payment_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_avail numeric(14,2);
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF COALESCE(NEW.mode, 'live') = 'test' THEN
      NEW.paid_at := COALESCE(NEW.paid_at, now());
      RETURN NEW;
    END IF;

    INSERT INTO public.seller_wallets (seller_id, available_usd, lifetime_earned_usd)
    VALUES (NEW.owner_id, NEW.net_usd, NEW.net_usd)
    ON CONFLICT (seller_id) DO UPDATE
      SET available_usd = seller_wallets.available_usd + NEW.net_usd,
          lifetime_earned_usd = seller_wallets.lifetime_earned_usd + NEW.net_usd,
          updated_at = now()
    RETURNING available_usd INTO new_avail;

    INSERT INTO public.wallet_transactions
      (seller_id, kind, amount_usd, balance_after_usd, description)
    VALUES
      (NEW.owner_id, 'sale', NEW.net_usd, new_avail,
       'API payment: ' || COALESCE(NEW.description, 'external charge')
       || ' ($' || NEW.amount_usd || ', fee $' || NEW.platform_fee_usd || ')');

    INSERT INTO public.notifications (user_id, category, title, body, link, read)
    VALUES (NEW.owner_id, 'system'::notification_category,
            'API payment received',
            'Your integration received $' || NEW.net_usd || ' (after $' || NEW.platform_fee_usd || ' fee).',
            '/wallet', false);

    NEW.paid_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
