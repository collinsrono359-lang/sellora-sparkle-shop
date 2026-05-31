
-- Rename pesapal_tracking_id to paystack_reference
ALTER TABLE public.payment_orders RENAME COLUMN pesapal_tracking_id TO paystack_reference;

-- Drop pesapal_config table (not needed for Paystack)
DROP TABLE IF EXISTS public.pesapal_config;
