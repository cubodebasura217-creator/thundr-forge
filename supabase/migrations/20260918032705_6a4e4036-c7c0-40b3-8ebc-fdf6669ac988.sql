ALTER TABLE public.chats
  ADD COLUMN spicy boolean NOT NULL DEFAULT false,
  ADD COLUMN background_path text;

COMMENT ON COLUMN public.chats.spicy IS 'Enables mature roleplay instructions for this chat.';
COMMENT ON COLUMN public.chats.background_path IS 'Private media storage path used as the chat wallpaper.';