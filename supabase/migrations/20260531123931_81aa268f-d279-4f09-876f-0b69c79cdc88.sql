
-- 1) Admins can update any profile (for unsuspend, badges, etc.)
DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- 2) Admins can insert notifications for any user (existing policy already covers this, but make explicit)
-- Already exists: "Users insert own notifications" allows admins via has_role.

-- 3) Auto-grant admin role to the project owner on signup
CREATE OR REPLACE FUNCTION public.auto_grant_owner_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'collinsrono359@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Mark the profile as Sellora Official + verified
    UPDATE public.profiles
       SET display_name = 'Sellora Official',
           verified = true,
           verified_at = COALESCE(verified_at, now()),
           verified_tier = COALESCE(verified_tier, 'official'),
           bio = COALESCE(NULLIF(bio,''), 'Official Sellora support & moderation. Contact us for help, appeals, or to report issues.')
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_owner_admin ON auth.users;
CREATE TRIGGER trg_auto_grant_owner_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_grant_owner_admin();

-- 4) If the user already exists, grant admin role now (idempotent backfill)
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'collinsrono359@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.profiles
       SET display_name = COALESCE(NULLIF(display_name,''), 'Sellora Official'),
           verified = true,
           verified_at = COALESCE(verified_at, now()),
           verified_tier = COALESCE(verified_tier, 'official')
     WHERE user_id = uid;
  END IF;
END$$;
