# Fix custom Gemini and OpenRouter chat access

## Changes
- Route Gemini-key chats through Google’s native streaming API with the saved model and API key in the supported query/header authentication form.
- Convert existing system and conversation messages into Gemini’s native request shape, while preserving the current 12-message context and response cap.
- Parse native Gemini streaming chunks alongside the existing built-in AI and OpenRouter streams.
- Extract Google’s nested error message and status so chat banners and toasts show the exact provider rejection and a useful Settings action.
- Keep both Gemini 1.5 Flash and Gemini 2.0 Flash selectable, and keep the OpenRouter key option prominent and easy to paste.

## Technical details
- Preserve built-in AI and OpenRouter request protocols; only Gemini BYOK uses `streamGenerateContent?alt=sse&key=...`.
- Do not expose keys to logs or error messages.
- Validate compilation and inspect the live Settings and chat error states after the edit.
