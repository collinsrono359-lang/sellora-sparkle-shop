REVOKE EXECUTE ON FUNCTION public.enqueue_webhook_event(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_webhook_event(text, jsonb) TO service_role;