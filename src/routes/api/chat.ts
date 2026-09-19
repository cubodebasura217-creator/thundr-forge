import { createFileRoute } from "@tanstack/react-router";

import { loadAiConfig } from "@/lib/ai-key.server";
import { GatewayError, REPLY_MAX_TOKENS, openChatStream, toTextStream } from "@/lib/ai.server";
import { loadTurnContext } from "@/lib/chat-context.server";
import { clientForRequest } from "@/lib/supabase-request.server";

type Body = { chatId?: string; excludeMessageIds?: string[]; nudge?: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase } = await clientForRequest(request);
          const body = (await request.json()) as Body;
          if (!body.chatId) return new Response("chatId is required", { status: 400 });

          const { instructions, messages } = await loadTurnContext(
            supabase,
            body.chatId,
            body.excludeMessageIds ?? [],
          );

          if (body.nudge) {
            messages.push({ role: "user", content: `(Director note: ${body.nudge})` });
          }

          const config = await loadAiConfig(supabase);
          const upstream = await openChatStream({
            instructions,
            messages,
            maxTokens: REPLY_MAX_TOKENS,
            config,
          });

          return new Response(toTextStream(upstream), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof GatewayError) {
            return new Response(error.message, { status: error.status });
          }
          console.error(error);
          return new Response(
            error instanceof Error ? error.message : "Failed to generate a reply",
            { status: 500 },
          );
        }
      },
    },
  },
});
