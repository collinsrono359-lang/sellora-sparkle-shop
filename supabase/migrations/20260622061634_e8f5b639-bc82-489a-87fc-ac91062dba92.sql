-- Platform payments: external apps charge their customers via Sellora's PayPal; net credits app owner's wallet.
CREATE TABLE public.api_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  amount_usd numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  platform_fee_pct numeric(5,4) NOT NULL,
  platform_fee_usd numeric(14,2) NOT NULL,
  net_usd numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  description text,
  customer_email text,
  customer_reference text,
  metadata jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending|paid|failed|refunded
  paypal_order_id text UNIQUE,
  paypal_capture_id text,
  raw_paypal jsonb,
  return_url text,
  cancel_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_payments TO authenticated;
GRANT ALL ON public.api_payments TO service_role;

ALTER TABLE public.api_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their api payments"
  ON public.api_payments FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX idx_api_payments_owner ON public.api_payments(owner_id, created_at DESC);
CREATE INDEX idx_api_payments_app ON public.api_payments(app_id, created_at DESC);

CREATE TRIGGER trg_api_payments_updated
  BEFORE UPDATE ON public.api_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- When an api_payment becomes paid: credit owner's available wallet with net_usd.
CREATE OR REPLACE FUNCTION public.credit_wallet_on_api_payment_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_avail numeric(14,2);
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
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
$$;

CREATE TRIGGER trg_api_payments_paid
  BEFORE UPDATE ON public.api_payments
  FOR EACH ROW EXECUTE FUNCTION public.credit_wallet_on_api_payment_paid();