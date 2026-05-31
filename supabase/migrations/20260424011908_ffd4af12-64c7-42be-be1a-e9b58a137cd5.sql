
-- Add tier metadata to products & profiles so payment fulfillment can grant benefits.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS boost_tier text,
  ADD COLUMN IF NOT EXISTS boost_expires_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_tier text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_boost_expires_at ON public.products (boost_expires_at);
