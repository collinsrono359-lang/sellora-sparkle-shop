
-- 1. Add 'released' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'released';

-- 2. Add released_at column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- 3. Replace trigger function: on paid -> add to pending; on released -> pending->available
CREATE OR REPLACE FUNCTION public.credit_wallet_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_pending numeric(14,2);
  new_avail numeric(14,2);
  cur_pending numeric(14,2);
BEGIN
  -- PAID: hold funds in escrow (pending)
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.seller_wallets (seller_id, pending_usd)
    VALUES (NEW.seller_id, NEW.seller_net_usd)
    ON CONFLICT (seller_id) DO UPDATE
      SET pending_usd = seller_wallets.pending_usd + NEW.seller_net_usd,
          updated_at = now()
    RETURNING pending_usd INTO new_pending;

    INSERT INTO public.wallet_transactions
      (seller_id, kind, amount_usd, balance_after_usd, order_id, description)
    VALUES
      (NEW.seller_id, 'sale', 0, NULL, NEW.id,
       'Payment held in escrow: ' || NEW.product_title || ' ($' || NEW.seller_net_usd
       || ' pending buyer confirmation, 10% fee: $' || NEW.platform_fee_usd || ')');

    INSERT INTO public.notifications (user_id, category, title, body, link, read)
    VALUES (NEW.seller_id, 'system'::notification_category,
            'Payment received (held)',
            'Buyer paid $' || NEW.seller_net_usd || ' for ' || NEW.product_title
            || '. Funds release when the buyer confirms delivery.',
            '/wallet', false);

    NEW.paid_at := now();

  -- RELEASED: buyer confirmed -> move pending to available
  ELSIF NEW.status = 'released' AND (OLD.status IS DISTINCT FROM 'released') THEN
    SELECT pending_usd INTO cur_pending FROM public.seller_wallets
      WHERE seller_id = NEW.seller_id FOR UPDATE;
    IF cur_pending IS NULL THEN cur_pending := 0; END IF;

    UPDATE public.seller_wallets
      SET pending_usd = GREATEST(0, pending_usd - NEW.seller_net_usd),
          available_usd = available_usd + NEW.seller_net_usd,
          lifetime_earned_usd = lifetime_earned_usd + NEW.seller_net_usd,
          updated_at = now()
      WHERE seller_id = NEW.seller_id
      RETURNING available_usd INTO new_avail;

    INSERT INTO public.wallet_transactions
      (seller_id, kind, amount_usd, balance_after_usd, order_id, description)
    VALUES
      (NEW.seller_id, 'sale', NEW.seller_net_usd, new_avail, NEW.id,
       'Released: ' || NEW.product_title || ' (buyer confirmed receipt)');

    INSERT INTO public.notifications (user_id, category, title, body, link, read)
    VALUES (NEW.seller_id, 'system'::notification_category,
            'Funds released',
            'Buyer confirmed delivery. $' || NEW.seller_net_usd || ' from "'
            || NEW.product_title || '" is now available to withdraw.',
            '/wallet', false);

    NEW.released_at := now();

  ELSIF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
