-- Fix notify_on_new_message trigger to use the correct enum value
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sender_name text;
BEGIN
  SELECT COALESCE(display_name, 'Someone') INTO sender_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, category, title, body, link, read)
  VALUES (
    NEW.recipient_id,
    'messages'::notification_category,
    COALESCE(sender_name, 'New message'),
    LEFT(COALESCE(NEW.body, ''), 140),
    '/inbox_/' || NEW.sender_id::text,
    false
  );
  RETURN NEW;
END;
$function$;

-- Reviews: enforce one review per (seller, reviewer) so upsert works
CREATE UNIQUE INDEX IF NOT EXISTS reviews_seller_reviewer_unique
  ON public.reviews (seller_id, reviewer_id);

-- Reviews: only allow inserts when the seller is verified
DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
CREATE POLICY "Users insert reviews for verified sellers"
ON public.reviews
FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id
  AND seller_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = reviews.seller_id AND p.verified = true
  )
);