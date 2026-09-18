# Thundr — queued updates

Twelve changes across look, creation forms, chat experience and reliability.

## 1. Softer look and header
- Swap the whole app to Nunito (headings and body) with rounded corners kept generous; drop Chakra Petch / DM Sans.
- Top bar keeps only the lightning bolt, no "Thundr" wordmark, freeing room for the category links.

## 2. Photo uploads from your phone
A shared image picker (tap to choose from camera roll, or take a photo on iPhone) used in three places:
- character avatar (next to "generate portrait")
- persona avatar
- chat background wallpaper
Uploads go to your private media space, same as generated pictures.

## 3. Simplified creation forms
- Character form loses the personality/traits, director notes and example dialogue boxes. Keeps name, tagline, description, greeting, avatar, worlds, public toggle.
- Persona form loses speaking style and preferences. Keeps name, description, avatar.
- Existing saved values stay in the database and still feed the story; they're just no longer edited here.

## 4. Spicy mode
- Quick toggle in the chat header (flame icon) and in the settings sheet, saved per chat.
- When on, the story instructions gain an explicit mature/unrestricted block — takes effect on the very next reply, no character editing.

## 5. Roleplay text formatting
- Instructions tell the model: *italics* for actions and narration, **bold** for internal thoughts, "quotes" for speech.
- Bubbles render that formatting: italic narration in a softer tone, bold thoughts tinted, quoted speech normal weight.

## 6. Discover page
New page that asks the model for fresh companion characters and story scenarios based on your existing characters and worlds. Each suggestion can be created as a real character (with a generated portrait) or started as a scenario chat. Refresh for a new batch.

## 7. Chat view upgrades
- **Persona selector**: header shows who you're playing; tap to switch persona, or edit the current one inline.
- **Swipe to regenerate**: dragging an AI bubble left generates a new alternative; dragging left/right moves between existing variants (arrow buttons stay for desktop).
- **Scene cards**: tap a card to open it full screen; from there set it as the chat wallpaper. Uploaded photos can also be set as wallpaper.
- **Editable memory**: the story summary in the memory panel becomes an editable text box with save, alongside the regenerate-summary button.

## 8. Error handling and retries
- A banner above the composer for a failed reply, with Retry.
- Inline error + Retry for image generation and for summaries.
- Errors explain the cause in plain words (out of credits, rate limited, temporary) instead of raw messages.

## Technical notes
- New migration: `chats.spicy boolean default false`, `chats.background_path text`; `personas.avatar_url` already exists.
- `src/lib/prompt.ts`: add formatting block + spicy block to `buildInstructions`; extend `ChatSettings` (spicy handled as a chat column so it can be toggled without touching settings JSON).
- New `src/components/ImageUploadButton.tsx` wrapping `uploadFile` from `src/lib/media.ts` with `accept="image/*"` and `capture` support.
- New `src/components/RoleplayText.tsx` — parses `**bold**` / `*italic*` / quotes into styled spans (no markdown library).
- New `src/routes/discover.tsx` + `suggestContent` server fn in `src/lib/ai.functions.ts` (openai/gpt-6-astra, JSON output).
- Swipe gestures via pointer events on the bubble; threshold ~60px, left past threshold on the newest variant triggers regenerate.
- Chat background rendered as a fixed layer behind the message list with a dark scrim so bubbles stay readable.
- Gateway failures surface through a shared `describeAiError` helper mapping 402/429/5xx to plain sentences.
