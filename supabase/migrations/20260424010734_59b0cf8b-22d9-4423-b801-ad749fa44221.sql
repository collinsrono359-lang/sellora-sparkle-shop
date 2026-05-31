-- Add message status fields and support for location messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Constrain message kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_kind_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text','location'));
  END IF;
END$$;

-- Backfill: existing read messages get a seen_at timestamp
UPDATE public.messages
SET seen_at = created_at
WHERE read = TRUE AND seen_at IS NULL;

-- All existing messages were at least delivered
UPDATE public.messages
SET delivered_at = created_at
WHERE delivered_at IS NULL;

-- Typing presence table (lightweight)
CREATE TABLE IF NOT EXISTS public.typing_status (
  user_id UUID NOT NULL,
  peer_id UUID NOT NULL,
  is_typing BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);

ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own typing status" ON public.typing_status;
CREATE POLICY "Users manage their own typing status"
ON public.typing_status
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see typing status directed to them" ON public.typing_status;
CREATE POLICY "Users see typing status directed to them"
ON public.typing_status
FOR SELECT
TO authenticated
USING (auth.uid() = peer_id OR auth.uid() = user_id);

-- Enable realtime on relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.typing_status REPLICA IDENTITY FULL;