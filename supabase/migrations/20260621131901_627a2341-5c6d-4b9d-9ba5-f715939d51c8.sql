
-- Developer apps (API clients)
CREATE TABLE public.developer_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  website text,
  key_prefix text NOT NULL UNIQUE,           -- e.g. sk_live_abc123 (first ~12 chars, shown in dashboard)
  key_hash text NOT NULL,                    -- sha256 hex of full secret
  scopes text[] NOT NULL DEFAULT ARRAY['read_products','read_profile']::text[],
  platform_fee_pct numeric(5,4) NOT NULL DEFAULT 0.10 CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 0.5),
  rate_limit_per_min integer NOT NULL DEFAULT 120,
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dev_apps_owner ON public.developer_apps(owner_id);
CREATE INDEX idx_dev_apps_prefix ON public.developer_apps(key_prefix);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developer_apps TO authenticated;
GRANT ALL ON public.developer_apps TO service_role;
ALTER TABLE public.developer_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view own apps" ON public.developer_apps FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owners insert own apps" ON public.developer_apps FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owners update own apps" ON public.developer_apps FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owners delete own apps" ON public.developer_apps FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER dev_apps_set_updated_at BEFORE UPDATE ON public.developer_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- API request audit log
CREATE TABLE public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  latency_ms integer,
  ip text,
  user_agent text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_logs_app_time ON public.api_request_logs(app_id, created_at DESC);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view own logs" ON public.api_request_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.developer_apps a WHERE a.id = app_id AND a.owner_id = auth.uid()));

-- Webhook endpoints
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,                      -- shared signing secret (whsec_...)
  events text[] NOT NULL DEFAULT ARRAY['*']::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhooks_app ON public.webhook_endpoints(app_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage own webhooks" ON public.webhook_endpoints FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.developer_apps a WHERE a.id = app_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.developer_apps a WHERE a.id = app_id AND a.owner_id = auth.uid()));
CREATE TRIGGER webhooks_set_updated_at BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook deliveries
CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',    -- pending | success | failed | dead
  attempts integer NOT NULL DEFAULT 0,
  last_status_code integer,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliv_endpoint ON public.webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX idx_deliv_pending ON public.webhook_deliveries(next_attempt_at) WHERE status IN ('pending','failed');
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view own deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.webhook_endpoints e
    JOIN public.developer_apps a ON a.id = e.app_id
    WHERE e.id = endpoint_id AND a.owner_id = auth.uid()
  ));

-- Enqueue webhook helper: fan out an event to every matching endpoint
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(_event_type text, _payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_deliveries (endpoint_id, event_type, payload)
  SELECT e.id, _event_type, _payload
    FROM public.webhook_endpoints e
   WHERE e.active = true
     AND ('*' = ANY(e.events) OR _event_type = ANY(e.events));
END;
$$;

-- Trigger: emit events on orders
CREATE OR REPLACE FUNCTION public.emit_order_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evt text;
  body jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt := 'order.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    evt := 'order.' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  body := jsonb_build_object(
    'id', NEW.id,
    'status', NEW.status,
    'product_id', NEW.product_id,
    'buyer_id', NEW.buyer_id,
    'seller_id', NEW.seller_id,
    'usd_amount', NEW.usd_amount,
    'platform_fee_usd', NEW.platform_fee_usd,
    'seller_net_usd', NEW.seller_net_usd,
    'created_at', NEW.created_at
  );
  PERFORM public.enqueue_webhook_event(evt, body);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_order_webhooks_ins ON public.orders;
DROP TRIGGER IF EXISTS trg_emit_order_webhooks_upd ON public.orders;
CREATE TRIGGER trg_emit_order_webhooks_ins AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_order_webhooks();
CREATE TRIGGER trg_emit_order_webhooks_upd AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_order_webhooks();

-- Trigger: emit product.created
CREATE OR REPLACE FUNCTION public.emit_product_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_webhook_event('product.created', jsonb_build_object(
    'id', NEW.id, 'title', NEW.title, 'price', NEW.price, 'currency', NEW.currency,
    'seller_id', NEW.seller_id, 'created_at', NEW.created_at
  ));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_emit_product_webhooks ON public.products;
CREATE TRIGGER trg_emit_product_webhooks AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.emit_product_webhooks();
