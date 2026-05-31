-- 1. Per-user chat clears (soft delete from one side only)
CREATE TABLE IF NOT EXISTS public.chat_clears (
  user_id uuid NOT NULL,
  peer_id uuid NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);

ALTER TABLE public.chat_clears ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own chat clears"
  ON public.chat_clears FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Product views (deduplicated)
CREATE TABLE IF NOT EXISTS public.product_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  viewer_id uuid,
  viewer_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_views_unique_user
  ON public.product_views (product_id, viewer_id)
  WHERE viewer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_views_unique_ip
  ON public.product_views (product_id, viewer_ip)
  WHERE viewer_id IS NULL AND viewer_ip IS NOT NULL;

ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a product view"
  ON public.product_views FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Sellers and admins read product views"
  ON public.product_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_views.product_id
        AND (p.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- 3. Function: record a unique view and bump counter only on first time
CREATE OR REPLACE FUNCTION public.record_product_view(_product_id uuid, _viewer_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NOT NULL THEN
    INSERT INTO public.product_views (product_id, viewer_id)
    VALUES (_product_id, uid)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
  ELSIF _viewer_ip IS NOT NULL AND length(_viewer_ip) > 0 THEN
    INSERT INTO public.product_views (product_id, viewer_ip)
    VALUES (_product_id, _viewer_ip)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
  END IF;

  IF inserted THEN
    UPDATE public.products
       SET views = COALESCE(views, 0) + 1
     WHERE id = _product_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_product_view(uuid, text) TO anon, authenticated;