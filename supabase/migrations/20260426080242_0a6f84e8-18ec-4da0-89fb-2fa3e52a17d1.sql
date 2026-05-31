
-- Add warning fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warning_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

-- Activity log
CREATE TABLE IF NOT EXISTS public.moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL, -- login, message, post, view, signup
  content text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_modevents_user_time ON public.moderation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modevents_ip_time ON public.moderation_events(ip, created_at DESC);

ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events"
  ON public.moderation_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users view own events"
  ON public.moderation_events FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Moderation flags / verdicts
CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  severity text NOT NULL DEFAULT 'low', -- low, medium, high, critical
  category text NOT NULL, -- rate_limit, content, login_anomaly, multi_account
  reason text NOT NULL,
  ai_verdict jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_modflags_user ON public.moderation_flags(user_id, created_at DESC);

ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own flags"
  ON public.moderation_flags FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Users acknowledge own flags"
  ON public.moderation_flags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage flags"
  ON public.moderation_flags FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Device fingerprints
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fingerprint text NOT NULL,
  ip text,
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_devfp_user ON public.device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_devfp_ip ON public.device_fingerprints(ip);

ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own devices"
  ON public.device_fingerprints FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all devices"
  ON public.device_fingerprints FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
