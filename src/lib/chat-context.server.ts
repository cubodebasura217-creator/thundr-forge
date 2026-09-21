import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildInstructions, matchLore, parseSettings } from "@/lib/prompt";
import type { GwMessage } from "@/lib/ai.server";

type StoredMessage = { id: string; role: string; content: string; is_pinned: boolean };

/** Loads everything the model needs for one chat turn. */
export async function loadTurnContext(
  supabase: SupabaseClient<Database>,
  chatId: string,
  excludeMessageIds: string[] = [],
): Promise<{ instructions: string; messages: GwMessage[]; characterName: string }> {
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .maybeSingle();
  if (chatError) throw new Response(chatError.message, { status: 400 });
  if (!chat) throw new Response("Chat not found", { status: 404 });

  const [characterRes, personaRes, messagesRes] = await Promise.all([
    chat.character_id
      ? supabase.from("characters").select("*").eq("id", chat.character_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    chat.persona_id
      ? supabase.from("personas").select("*").eq("id", chat.persona_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("messages")
      .select("id, role, content, is_pinned")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true }),
  ]);

  const character = characterRes.data;
  if (!character) throw new Response("This chat has no character", { status: 400 });

  const linkRes = await supabase
    .from("character_worlds")
    .select("world_id")
    .eq("character_id", character.id);
  const worldIds = (linkRes.data ?? []).map((l) => l.world_id);

  const [worldsRes, entriesRes] = await Promise.all([
    worldIds.length
      ? supabase.from("worlds").select("name, overview").in("id", worldIds)
      : Promise.resolve({ data: [], error: null }),
    worldIds.length
      ? supabase
          .from("world_entries")
          .select("keywords, content, always_on")
          .in("world_id", worldIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const allMessages = (messagesRes.data ?? []).filter((m) => !excludeMessageIds.includes(m.id));
  const recentText = allMessages
    .slice(-8)
    .map((m) => m.content)
    .join("\n");

  const instructions = buildInstructions({
    character: {
      name: character.name,
      tagline: character.tagline,
      description: character.description,
      traits: character.traits ?? [],
      system_prompt: character.system_prompt,
      example_dialogue: character.example_dialogue,
      story_goals: character.story_goals,
    },
    persona: personaRes.data
      ? {
          name: personaRes.data.name,
          description: personaRes.data.description,
          speaking_style: personaRes.data.speaking_style,
          preferences: personaRes.data.preferences,
        }
      : null,
    worlds: (worldsRes.data ?? []).map((w) => ({ name: w.name, overview: w.overview })),
    loreEntries: matchLore(entriesRes.data ?? [], recentText),
    pinned: allMessages.filter((m) => m.is_pinned).map((m) => m.content),
    summary: chat.summary,
    settings: parseSettings(chat.settings),
    spicy: chat.spicy,
  });

  // Keep only the last 12 turns; older events live in the summary, pins and lore.
  const window: StoredMessage[] = allMessages.slice(-12);
  const messages: GwMessage[] = window.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  if (!messages.length) {
    messages.push({ role: "user", content: "(Begin the scene.)" });
  }

  return { instructions, messages, characterName: character.name };
}
