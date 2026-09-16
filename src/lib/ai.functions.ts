import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GatewayError, generateImageBase64, generateText } from "@/lib/ai.server";
import { SUMMARY_INSTRUCTIONS } from "@/lib/prompt";

function toMessage(error: unknown): Error {
  if (error instanceof GatewayError) return new Error(error.message);
  return error instanceof Error ? error : new Error("Something went wrong");
}

/** Rebuilds a chat's running story summary from its messages. */
export const summarizeChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chatId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: chat } = await supabase
      .from("chats")
      .select("id, summary, summarized_count")
      .eq("id", data.chatId)
      .maybeSingle();
    if (!chat) throw new Error("Chat not found");

    const { data: messages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    const all = messages ?? [];
    if (all.length < 2) return { summary: chat.summary, count: all.length };

    // Summarize everything except the most recent turns, which stay in context verbatim.
    const keepLive = 8;
    const toFold = all.slice(0, Math.max(0, all.length - keepLive));
    if (!toFold.length) return { summary: chat.summary, count: chat.summarized_count };

    const transcript = toFold
      .map((m) => `${m.role === "assistant" ? "CHARACTER" : "USER"}: ${m.content}`)
      .join("\n\n");

    try {
      const summary = await generateText({
        instructions: SUMMARY_INSTRUCTIONS,
        messages: [
          {
            role: "user",
            content: `Previous summary:\n${chat.summary || "(none yet)"}\n\nNew messages to fold in:\n${transcript}`,
          },
        ],
        effort: "low",
      });

      const { error } = await supabase
        .from("chats")
        .update({ summary, summarized_count: toFold.length })
        .eq("id", data.chatId);
      if (error) throw new Error(error.message);

      return { summary, count: toFold.length };
    } catch (error) {
      throw toMessage(error);
    }
  });

/** Generates an image and returns it as base64 for the browser to store. */
export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1500),
        kind: z.enum(["avatar", "scene"]).default("scene"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const styled =
      data.kind === "avatar"
        ? `Character portrait: ${data.prompt}. Head and shoulders, dramatic rim lighting, cinematic, highly detailed, square composition.`
        : `Cinematic scene illustration: ${data.prompt}. Atmospheric lighting, painterly detail, wide composition.`;
    try {
      const base64 = await generateImageBase64(styled);
      return { base64 };
    } catch (error) {
      throw toMessage(error);
    }
  });

/** Drafts character fields from a one-line idea. */
export const draftCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ idea: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const raw = await generateText({
        instructions: `You design roleplay characters. Reply with ONLY a JSON object using these keys: name, tagline, description, greeting, traits (array of up to 6 short strings), system_prompt, example_dialogue. Keep description under 180 words, greeting in the character's voice, system_prompt as director notes about how to play them. No markdown fences.`,
        messages: [{ role: "user", content: `Character idea: ${data.idea}` }],
        effort: "low",
      });
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        name: String(parsed.name ?? ""),
        tagline: String(parsed.tagline ?? ""),
        description: String(parsed.description ?? ""),
        greeting: String(parsed.greeting ?? ""),
        traits: Array.isArray(parsed.traits) ? parsed.traits.map(String).slice(0, 8) : [],
        system_prompt: String(parsed.system_prompt ?? ""),
        example_dialogue: String(parsed.example_dialogue ?? ""),
      };
    } catch (error) {
      throw toMessage(error);
    }
  });
