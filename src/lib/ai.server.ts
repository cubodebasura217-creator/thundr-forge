const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "lovable/image-standard";

export type GwRole = "user" | "assistant";
export type GwMessage = { role: GwRole; content: string };

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Opens a streaming Responses API call and returns the raw SSE response. */
export async function openResponsesStream(opts: {
  instructions: string;
  messages: GwMessage[];
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<Response> {
  const res = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: CHAT_MODEL,
      instructions: opts.instructions,
      input: opts.messages.map((m) => ({
        role: m.role,
        content: [
          {
            type: m.role === "assistant" ? "output_text" : "input_text",
            text: m.content,
          },
        ],
      })),
      stream: true,
      store: false,
      reasoning: { effort: opts.effort ?? "low" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GatewayError(res.status, gatewayMessage(res.status, body));
  }
  return res;
}

export function gatewayMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    const msg = parsed.error?.message ?? parsed.message;
    if (msg) return msg;
  } catch {
    /* not json */
  }
  if (status === 402) return "The workspace is out of AI credits. Add credits to keep generating.";
  if (status === 429) return "Too many requests right now — try again in a moment.";
  return `AI request failed (${status}).`;
}

function* parseSseLines(buffer: string): Generator<string> {
  for (const line of buffer.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
  }
}

/** Converts a Responses SSE stream into a plain UTF-8 text delta stream. */
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
              const event = JSON.parse(data) as { type?: string; delta?: string };
              if (event.type === "response.output_text.delta" && event.delta) out += event.delta;
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

/** Runs a streaming Responses call server-side and returns the full text. */
export async function generateText(opts: {
  instructions: string;
  messages: GwMessage[];
  effort?: "low" | "medium" | "high";
}): Promise<string> {
  const res = await openResponsesStream(opts);
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
      "Lovable-API-Key": apiKey(),
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
