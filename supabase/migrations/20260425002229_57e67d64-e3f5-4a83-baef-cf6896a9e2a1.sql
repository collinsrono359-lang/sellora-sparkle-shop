DROP POLICY IF EXISTS "Anyone can record a product view" ON public.product_views;

CREATE POLICY "Anyone can record a view for an active product"
  ON public.product_views FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_views.product_id
        AND p.status = 'active'::product_status
    )
  );