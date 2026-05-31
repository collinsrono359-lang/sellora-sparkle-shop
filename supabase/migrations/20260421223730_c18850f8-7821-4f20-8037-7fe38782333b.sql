-- Payment orders table tracking Pesapal transactions
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'cancelled', 'reversed');
CREATE TYPE public.payment_purpose AS ENUM ('boost_product', 'verification', 'subscription', 'other');

CREATE TABLE public.payment_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  merchant_reference TEXT NOT NULL UNIQUE,
  pesapal_tracking_id TEXT UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  description TEXT NOT NULL,
  purpose public.payment_purpose NOT NULL DEFAULT 'other',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  confirmation_code TEXT,
  redirect_url TEXT,
  raw_status_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_orders_user ON public.payment_orders(user_id);
CREATE INDEX idx_payment_orders_tracking ON public.payment_orders(pesapal_tracking_id);
CREATE INDEX idx_payment_orders_status ON public.payment_orders(status);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own payment orders"
ON public.payment_orders FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all payment orders"
ON public.payment_orders FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Insert/update is server-side only (service role bypasses RLS); no public insert/update policy
-- This prevents users from tampering with payment status

CREATE TRIGGER update_payment_orders_updated_at
BEFORE UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Store the Pesapal IPN id once registered (singleton row)
CREATE TABLE public.pesapal_config (
  id INT PRIMARY KEY DEFAULT 1,
  ipn_id TEXT,
  ipn_url TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE public.pesapal_config ENABLE ROW LEVEL SECURITY;
-- No policies — only service role accesses this table.