import { supabase } from "@/integrations/supabase/client";

/** Creates a chat for a character, seeding the greeting as the first message. */
export async function startChat(userId: string, characterId: string): Promise<string> {
  const { data: character, error: charError } = await supabase
    .from("characters")
    .select("id, name, greeting")
    .eq("id", characterId)
    .maybeSingle();
  if (charError) throw charError;
  if (!character) throw new Error("Character not found");

  const { data: persona } = await supabase
    .from("personas")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      user_id: userId,
      character_id: character.id,
      persona_id: persona?.id ?? null,
      title: character.name,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (character.greeting.trim()) {
    const { data: message } = await supabase
      .from("messages")
      .insert({
        chat_id: chat.id,
        user_id: userId,
        role: "assistant",
        content: character.greeting,
      })
      .select("id")
      .single();
    if (message) {
      await supabase.from("message_variants").insert({
        message_id: message.id,
        user_id: userId,
        idx: 0,
        content: character.greeting,
      });
    }
  }

  return chat.id;
}
