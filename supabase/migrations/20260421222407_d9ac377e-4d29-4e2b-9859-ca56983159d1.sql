
-- Replace overly permissive notification insert
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Restrict bucket listing: only allow SELECT on objects (still public via signed/url) but require valid path prefix
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read banners" ON storage.objects;
DROP POLICY IF EXISTS "Public read products" ON storage.objects;

CREATE POLICY "Read avatars by path" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "Read banners by path" ON storage.objects FOR SELECT
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "Read products by path" ON storage.objects FOR SELECT
  USING (bucket_id = 'products' AND (storage.foldername(name))[1] IS NOT NULL);
