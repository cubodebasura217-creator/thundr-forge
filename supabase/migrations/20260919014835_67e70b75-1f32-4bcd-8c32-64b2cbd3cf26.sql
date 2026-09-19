CREATE TABLE IF NOT EXISTS public.user_ai_keys (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable',
  api_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_keys TO authenticated;
GRANT ALL ON public.user_ai_keys TO service_role;
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own AI key" ON public.user_ai_keys;
CREATE POLICY "Users manage their own AI key" ON public.user_ai_keys FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS user_ai_keys_updated ON public.user_ai_keys;
CREATE TRIGGER user_ai_keys_updated BEFORE UPDATE ON public.user_ai_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();