
-- 1. Blocked IPs table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  reason text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  blocked_until timestamptz,
  permanent boolean NOT NULL DEFAULT false,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blocked_ips_ip_idx ON public.blocked_ips(ip);

GRANT SELECT ON public.blocked_ips TO anon, authenticated;
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_ips read all" ON public.blocked_ips FOR SELECT USING (true);

-- 2. Helper to check current block status
CREATE OR REPLACE FUNCTION public.is_ip_blocked(_ip text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.blocked_ips
    WHERE ip = _ip
      AND (permanent = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  );
$$;

-- 3. Update repeat offense trigger -> PERMANENT BAN on 2nd violation
CREATE OR REPLACE FUNCTION public.handle_repeat_offense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior_count int;
BEGIN
  SELECT COUNT(*) INTO prior_count
  FROM public.moderation_flags
  WHERE user_id = NEW.user_id AND id <> NEW.id;

  IF prior_count >= 1 THEN
    UPDATE public.profiles
       SET suspended_until = now() + interval '100 years',
           permanent_ban = true,
           ban_reason = 'Permanent ban: repeat violation (' || NEW.category || ')',
           warning_count = COALESCE(warning_count,0) + 1
     WHERE user_id = NEW.user_id;

    INSERT INTO public.notifications (user_id, category, title, body, read)
    VALUES (NEW.user_id, 'system'::notification_category,
            'Account permanently suspended',
            'You have repeated a terms violation. Your account is permanently banned. You can request a data export or account deletion.',
            false);
  END IF;
  RETURN NEW;
END;
$$;
