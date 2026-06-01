
-- Enums
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending','paid','failed','refunded','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.withdrawal_status AS ENUM ('pending','processing','paid','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_txn_kind AS ENUM ('sale','withdrawal','fee','refund','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_title text NOT NULL,
  original_price numeric(14,2) NOT NULL,
  original_currency text NOT NULL DEFAULT 'KES',
  usd_amount numeric(14,2) NOT NULL,
  fx_rate numeric(18,8),
  platform_fee_usd numeric(14,2) NOT NULL DEFAULT 0,
  seller_net_usd numeric(14,2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pending',
  paypal_order_id text UNIQUE,
  paypal_capture_id text,
  buyer_email text,
  buyer_name text,
  shipping_address jsonb,
  notes text,
  raw_paypal jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  failed_at timestamptz
);
CREATE INDEX idx_orders_buyer ON public.orders(buyer_id);
CREATE INDEX idx_orders_seller ON public.orders(seller_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_paypal ON public.orders(paypal_order_id);

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own orders" ON public.orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Buyers create own orders" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seller wallets
CREATE TABLE public.seller_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE,
  available_usd numeric(14,2) NOT NULL DEFAULT 0,
  pending_usd numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_earned_usd numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_withdrawn_usd numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.seller_wallets TO authenticated;
GRANT ALL ON public.seller_wallets TO service_role;
ALTER TABLE public.seller_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own wallet" ON public.seller_wallets FOR SELECT
  USING (auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Sellers insert own wallet" ON public.seller_wallets FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Admins update wallets" ON public.seller_wallets FOR UPDATE
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_seller_wallets_updated BEFORE UPDATE ON public.seller_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wallet transactions
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  kind public.wallet_txn_kind NOT NULL,
  amount_usd numeric(14,2) NOT NULL,
  balance_after_usd numeric(14,2),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  withdrawal_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_txn_seller ON public.wallet_transactions(seller_id, created_at DESC);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own txns" ON public.wallet_transactions FOR SELECT
  USING (auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role));

-- Withdrawals
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  amount_usd numeric(14,2) NOT NULL,
  recipient_email text NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  paypal_batch_id text,
  paypal_item_id text,
  failure_reason text,
  raw_paypal jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX idx_withdrawals_seller ON public.withdrawals(seller_id, created_at DESC);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);

GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own withdrawals" ON public.withdrawals FOR SELECT
  USING (auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Sellers create own withdrawals" ON public.withdrawals FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Admins update withdrawals" ON public.withdrawals FOR UPDATE
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_withdrawals_updated BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seller PayPal accounts (encrypted tokens)
CREATE TABLE public.seller_paypal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE,
  payer_id text,
  payer_email text NOT NULL,
  verified_account boolean NOT NULL DEFAULT false,
  refresh_token_encrypted text,
  scopes text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_paypal_accounts TO authenticated;
GRANT ALL ON public.seller_paypal_accounts TO service_role;
ALTER TABLE public.seller_paypal_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own PayPal" ON public.seller_paypal_accounts FOR ALL
  USING (auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (auth.uid() = seller_id OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_paypal_acct_updated BEFORE UPDATE ON public.seller_paypal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payment polling queue
CREATE TABLE public.payment_poll_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  attempts int NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poll_jobs_due ON public.payment_poll_jobs(next_run_at) WHERE done = false;
GRANT ALL ON public.payment_poll_jobs TO service_role;
ALTER TABLE public.payment_poll_jobs ENABLE ROW LEVEL SECURITY;

-- Auto-credit wallet on order paid
CREATE OR REPLACE FUNCTION public.credit_wallet_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_bal numeric(14,2);
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.seller_wallets (seller_id, available_usd, lifetime_earned_usd)
    VALUES (NEW.seller_id, NEW.seller_net_usd, NEW.seller_net_usd)
    ON CONFLICT (seller_id) DO UPDATE
      SET available_usd = seller_wallets.available_usd + NEW.seller_net_usd,
          lifetime_earned_usd = seller_wallets.lifetime_earned_usd + NEW.seller_net_usd,
          updated_at = now()
    RETURNING available_usd INTO new_bal;

    INSERT INTO public.wallet_transactions
      (seller_id, kind, amount_usd, balance_after_usd, order_id, description)
    VALUES
      (NEW.seller_id, 'sale', NEW.seller_net_usd, new_bal, NEW.id,
       'Sale: ' || NEW.product_title || ' (10% fee: $' || NEW.platform_fee_usd || ')');

    INSERT INTO public.notifications (user_id, category, title, body, link, read)
    VALUES (NEW.seller_id, 'system'::notification_category,
            'Payment received',
            'You earned $' || NEW.seller_net_usd || ' from ' || NEW.product_title,
            '/wallet', false);

    NEW.paid_at := now();
  ELSIF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_credit_wallet
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.credit_wallet_on_paid();
