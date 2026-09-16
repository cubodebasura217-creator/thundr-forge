# Thundr — AI Roleplay Chat

A neon-blue-on-black roleplay app: build characters and worlds, chat with them in sleek speech bubbles, and keep long stories coherent with automatic summaries.

## Look and feel

- Near-black backgrounds, electric light-blue accents, soft glow on active elements, rounded speech bubbles (character bubbles dark with a blue edge glow, your bubbles filled blue).
- Condensed geometric headings with a clean body typeface; subtle motion on send, regenerate, and swipe.

## What gets built

### 1. Accounts and personas
- Sign up / sign in with email.
- Create multiple personas (name, description, speaking style, preferences) and switch the active one at any time; chats record which persona was used.

### 2. Character builder
- Avatar, name, short description, greeting message, personality traits (tag chips), instructions that steer the AI, example dialogue.
- Public/private toggle and a browse gallery of your characters.

### 3. Worlds / lorebooks
- A world has a name, overview, and a list of entries (keyword + text). Entries whose keywords appear in recent messages get injected into context.
- Characters can be linked to one or more worlds.

### 4. Chat
- Speech-bubble thread with streaming replies.
- Edit any message (yours or the character's) in place.
- Regenerate replies; alternatives are kept and you swipe left/right between them with a counter (2/4).
- Pin messages; a pinned panel keeps them always in context.
- Per-chat creative controls: response length, temperature/wildness, narration style, and a free-form extra instruction box for open-ended storytelling setup.

### 5. Memory and summaries
- Running story summary updated automatically as the chat grows, plus a manual "summarize now" button.
- Editable summary panel showing tracked key events; summary + pinned messages + matched lorebook entries + recent turns form the model context.

### 6. Image generation
- Generate a character avatar from a prompt (or from the character's own description).
- Generate scene cards inside a chat, saved to a gallery for that chat.

## Technical notes

- Lovable Cloud for accounts, database, and image storage. Tables: personas, characters, worlds, world_entries, character_worlds, chats, messages, message_variants, chat_images — all row-level-secured to their owner.
- Chat and summarization run server-side through Lovable AI (streaming); image generation via the Lovable AI image model, saved to storage.
- Content: model providers still apply their own safety limits, so "unrestricted" means the app adds no extra filtering and exposes full prompt control — some requests can still be refused upstream.

## Build order

1. Design system + shell, auth, personas.
2. Character builder + gallery.
3. Worlds/lorebooks + linking.
4. Chat with streaming, edit, regenerate/swipe, pin.
5. Summary/memory pipeline.
6. Avatar + scene image generation.
