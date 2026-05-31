
-- 1) Create private user_blocks table to replace public profiles.blocked_users
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own block list"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users insert into their own block list"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users delete from their own block list"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

INSERT INTO public.user_blocks (blocker_id, blocked_id)
SELECT p.user_id, unnest(p.blocked_users)
FROM public.profiles p
WHERE p.blocked_users IS NOT NULL AND array_length(p.blocked_users, 1) > 0
ON CONFLICT DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS blocked_users;

-- 2) Pesapal config: admin-only policies
CREATE POLICY "Admins view pesapal config"
  ON public.pesapal_config FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert pesapal config"
  ON public.pesapal_config FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update pesapal config"
  ON public.pesapal_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete pesapal config"
  ON public.pesapal_config FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Remove invalid self-reviews then enforce constraint
DELETE FROM public.reviews WHERE reviewer_id = seller_id;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_no_self_review;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_no_self_review CHECK (reviewer_id <> seller_id);

DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
CREATE POLICY "Users insert own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id AND seller_id <> auth.uid());

-- 4) Storage delete policies for own files
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own banner"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'banners' AND (auth.uid())::text = (storage.foldername(name))[1]);
