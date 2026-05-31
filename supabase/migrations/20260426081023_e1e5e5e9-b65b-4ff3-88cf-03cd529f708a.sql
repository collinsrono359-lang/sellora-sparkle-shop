
CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_id uuid REFERENCES public.moderation_flags(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  admin_response text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON public.moderation_appeals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON public.moderation_appeals(status);

ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own appeals"
  ON public.moderation_appeals FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Users create own appeals"
  ON public.moderation_appeals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update appeals"
  ON public.moderation_appeals FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Trigger: when an appeal is approved, clear the user's suspension & reset warnings
CREATE OR REPLACE FUNCTION public.handle_appeal_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles
       SET suspended_until = NULL,
           warning_count = 0
     WHERE user_id = NEW.user_id;

    -- Acknowledge any open flags so banners disappear
    UPDATE public.moderation_flags
       SET acknowledged = true
     WHERE user_id = NEW.user_id AND acknowledged = false;

    NEW.reviewed_at := now();
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appeal_decision ON public.moderation_appeals;
CREATE TRIGGER trg_appeal_decision
  BEFORE UPDATE ON public.moderation_appeals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appeal_decision();

-- Enable realtime so users see decision without refresh
ALTER TABLE public.moderation_appeals REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.moderation_appeals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
