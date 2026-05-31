-- 1. Extend moderation_appeals & profiles
ALTER TABLE public.moderation_appeals
  ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS selfie_path text,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permanent_ban boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason text;

-- 2. Trigger: 2nd same-category flag = 120-day ban
CREATE OR REPLACE FUNCTION public.handle_repeat_offense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prior_count int;
BEGIN
  SELECT COUNT(*) INTO prior_count
  FROM public.moderation_flags
  WHERE user_id = NEW.user_id
    AND category = NEW.category
    AND id <> NEW.id;

  IF prior_count >= 1 THEN
    -- 2nd same-category violation → 120-day ban
    UPDATE public.profiles
       SET suspended_until = now() + interval '120 days',
           ban_reason = 'Repeat violation: ' || NEW.category,
           warning_count = COALESCE(warning_count, 0) + 1
     WHERE user_id = NEW.user_id;

    INSERT INTO public.notifications (user_id, category, title, body, read)
    VALUES (
      NEW.user_id,
      'system'::notification_category,
      'Account banned for 120 days',
      'You have repeated the same violation. A critical appeal with proofs and KYC is required.',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repeat_offense ON public.moderation_flags;
CREATE TRIGGER trg_repeat_offense
AFTER INSERT ON public.moderation_flags
FOR EACH ROW
EXECUTE FUNCTION public.handle_repeat_offense();

-- 3. Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'under_review',
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a ticket"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users view own tickets"
  ON public.support_tickets FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
  );

CREATE POLICY "Admins update tickets"
  ON public.support_tickets FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();