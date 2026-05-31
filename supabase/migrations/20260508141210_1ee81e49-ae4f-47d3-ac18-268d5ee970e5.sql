
-- 1) Signup attempts log (for device-based signup throttling)
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text,
  ip text,
  email text,
  status text NOT NULL DEFAULT 'attempt', -- attempt | rejected | success
  reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_fp ON public.signup_attempts (fingerprint);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON public.signup_attempts (ip);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_created ON public.signup_attempts (created_at DESC);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record signup attempt"
ON public.signup_attempts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins view signup attempts"
ON public.signup_attempts FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- 2) Auto-create a notification when a new message arrives
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT COALESCE(display_name, 'Someone') INTO sender_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, category, title, body, link, read)
  VALUES (
    NEW.recipient_id,
    'message',
    COALESCE(sender_name, 'New message'),
    LEFT(COALESCE(NEW.body, ''), 140),
    '/inbox_/' || NEW.sender_id::text,
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_notify ON public.messages;
CREATE TRIGGER trg_messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_message();

-- Ensure realtime emits full rows for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
