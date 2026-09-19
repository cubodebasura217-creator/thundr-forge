const GATEWAY = "https://ai.gateway.lovable.dev/v1";
/** Fast, low-cost chat model used for every roleplay turn. */
const CHAT_MODEL = "google/gemini-3.1-flash-lite";
const IMAGE_MODEL = "lovable/image-standard";

/** Keeps replies punchy and cheap. */
export const REPLY_MAX_TOKENS = 350;
const UTILITY_MAX_TOKENS = 700;

export type GwRole = "user" | "assistant";
export type GwMessage = { role: GwRole; content: string };

/** Which service (and key) a request should run on. */
export type AiConfig = { provider: "lovable" | "gemini" | "openrouter"; apiKey: string };

function lovableKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export const LOVABLE_CONFIG: AiConfig = { provider: "lovable", apiKey: "" };

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function endpointFor(config: AiConfig): {
  url: string;
  model: string;
  headers: Record<string, string>;
} {
  if (config.provider === "gemini" && config.apiKey) {
    return {
      // Google's OpenAI-compatibility endpoint accepts bare model ids like "gemini-2.5-flash".
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-2.5-flash",
      headers: { Authorization: `Bearer ${config.apiKey}` },
    };
  }
  if (config.provider === "openrouter" && config.apiKey) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: "google/gemini-2.5-flash",
      headers: { Authorization: `Bearer ${config.apiKey}` },
    };
  }
  return {
    url: `${GATEWAY}/chat/completions`,
    model: CHAT_MODEL,
    headers: { "Lovable-API-Key": lovableKey(), "X-Lovable-AIG-SDK": "fetch" },
  };
}

/** Opens a streaming chat-completions call and returns the raw SSE response. */
export async function openChatStream(opts: {
  instructions: string;
  messages: GwMessage[];
  maxTokens?: number;
  config?: AiConfig;
  signal?: AbortSignal;
}): Promise<Response> {
  const { url, model, headers } = endpointFor(opts.config ?? LOVABLE_CONFIG);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(opts.signal ? { signal: opts.signal } : {}),
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: opts.maxTokens ?? REPLY_MAX_TOKENS,
      messages: [
        { role: "system", content: opts.instructions },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GatewayError(res.status, gatewayMessage(res.status, body, { provider, model }));
  }
  return res;
}

function providerLabel(provider: AiConfig["provider"]): string {
  if (provider === "gemini") return "your Gemini key";
  if (provider === "openrouter") return "your OpenRouter key";
  return "the built-in AI";
}

export function gatewayMessage(
  status: number,
  body: string,
  source?: { provider?: AiConfig["provider"]; model?: string },
): string {
  const provider = source?.provider ?? "lovable";
  const model = source?.model ?? "";
  let upstream = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    upstream = (parsed.error?.message ?? parsed.message ?? "").trim();
  } catch {
    /* not json */
  }

  if (status === 404) {
    const where = provider === "lovable" ? "the built-in AI service" : providerLabel(provider);
    const detail = upstream ? ` (${upstream})` : "";
    return `The AI model "${model}" isn't available on ${where}${detail}. Pick a different AI in Settings, or clear your own key to use the built-in AI.`;
  }
  if (upstream) return upstream;
  if (status === 400)
    return `The AI request was rejected as invalid by ${providerLabel(provider)}. The model "${model}" may not accept these settings.`;
  if (status === 401 || status === 403)
    return `${providerLabel(provider)} was rejected. Check your key in Settings, or clear it to use the built-in AI.`;
  if (status === 402)
    return "The built-in AI is out of credits. Top up credits, or add your own Gemini/OpenRouter key in Settings.";
  if (status === 429) return "Too many requests right now — try again in a moment.";
  return `AI request failed (${status}) using ${providerLabel(provider)}.`;
}

function* parseSseLines(buffer: string): Generator<string> {
  for (const line of buffer.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
  }
}

type StreamEvent = {
  type?: string;
  delta?: string;
  choices?: Array<{ delta?: { content?: string | null } }>;
};

function deltaFrom(event: StreamEvent): string {
  const chunk = event.choices?.[0]?.delta?.content;
  if (chunk) return chunk;
  if (event.type === "response.output_text.delta" && event.delta) return event.delta;
  return "";
}

/** Converts an SSE stream into a plain UTF-8 text delta stream. */
export function toTextStream(res: Response): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = res.body!.getReader();
  let pending = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        pending += decoder.decode(value, { stream: true });
        const chunks = pending.split("\n\n");
        pending = chunks.pop() ?? "";
        let out = "";
        for (const chunk of chunks) {
          for (const data of parseSseLines(chunk)) {
            if (!data || data === "[DONE]") continue;
            try {
              out += deltaFrom(JSON.parse(data) as StreamEvent);
            } catch {
              /* ignore keep-alives */
            }
          }
        }
        if (out) {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** Runs a streaming chat call server-side and returns the full text. */
export async function generateText(opts: {
  instructions: string;
  messages: GwMessage[];
  maxTokens?: number;
  config?: AiConfig;
}): Promise<string> {
  const res = await openChatStream({ ...opts, maxTokens: opts.maxTokens ?? UTILITY_MAX_TOKENS });
  const reader = toTextStream(res).getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text.trim();
}

/** Generates an image and returns raw base64 (no data-url prefix). */
export async function generateImageBase64(prompt: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GatewayError(res.status, gatewayMessage(res.status, body));
  }

  const payload = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = payload.data?.[0];
  if (first?.b64_json) return first.b64_json;
  if (first?.url) {
    const img = await fetch(first.url);
    const buf = new Uint8Array(await img.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
    return btoa(binary);
  }
  throw new GatewayError(502, "The image service returned no image.");
}
