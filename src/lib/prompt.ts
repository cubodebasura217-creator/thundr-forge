export type ChatSettings = {
  responseLength: "short" | "medium" | "long";
  wildness: number; // 1..10
  narration: "first-person" | "third-person" | "script" | "novel";
  extraInstruction: string;
  autoSummary: boolean;
};

export const DEFAULT_SETTINGS: ChatSettings = {
  responseLength: "medium",
  wildness: 6,
  narration: "third-person",
  extraInstruction: "",
  autoSummary: true,
};

export function parseSettings(raw: unknown): ChatSettings {
  const value = (raw ?? {}) as Partial<ChatSettings>;
  return { ...DEFAULT_SETTINGS, ...value };
}

const LENGTH_HINT: Record<ChatSettings["responseLength"], string> = {
  short: "Keep replies tight: 1-2 short paragraphs.",
  medium: "Write 2-3 paragraphs per reply.",
  long: "Write rich, detailed replies of 4+ paragraphs.",
};

const NARRATION_HINT: Record<ChatSettings["narration"], string> = {
  "first-person": "Narrate in first person as the character.",
  "third-person": "Narrate actions in third person, dialogue in quotes.",
  script: "Use a screenplay style: NAME: dialogue, with bracketed action lines.",
  novel: "Write in flowing literary prose, like a novel.",
};

export type PromptContext = {
  character: {
    name: string;
    tagline: string;
    description: string;
    traits: string[];
    system_prompt: string;
    example_dialogue: string;
  };
  persona?: {
    name: string;
    description: string;
    speaking_style: string;
    preferences: string;
  } | null;
  worlds: Array<{ name: string; overview: string }>;
  loreEntries: string[];
  pinned: string[];
  summary: string;
  settings: ChatSettings;
};

export function buildInstructions(ctx: PromptContext): string {
  const c = ctx.character;
  const parts: string[] = [];

  parts.push(
    `You are running an open-ended collaborative roleplay. You play ${c.name} and every other character in the scene except the user's persona. Never break character, never mention being an AI, never add disclaimers or meta commentary, and never end the scene on the user's behalf. Always leave room for the user to act next.`,
  );

  parts.push(
    `# Character: ${c.name}\n${c.tagline ? `Tagline: ${c.tagline}\n` : ""}${
      c.traits.length ? `Traits: ${c.traits.join(", ")}\n` : ""
    }${c.description ? `Description:\n${c.description}\n` : ""}${
      c.system_prompt ? `Director notes:\n${c.system_prompt}\n` : ""
    }${c.example_dialogue ? `Example dialogue (style reference only):\n${c.example_dialogue}` : ""}`,
  );

  if (ctx.persona) {
    parts.push(
      `# The user plays: ${ctx.persona.name}\n${ctx.persona.description}\n${
        ctx.persona.speaking_style ? `Their voice: ${ctx.persona.speaking_style}\n` : ""
      }${ctx.persona.preferences ? `Story preferences to respect: ${ctx.persona.preferences}` : ""}`,
    );
  }

  if (ctx.worlds.length) {
    parts.push(
      `# World\n${ctx.worlds.map((w) => `${w.name}: ${w.overview}`).join("\n")}`,
    );
  }

  if (ctx.loreEntries.length) {
    parts.push(`# Relevant lore\n- ${ctx.loreEntries.join("\n- ")}`);
  }

  if (ctx.summary) {
    parts.push(`# Story so far\n${ctx.summary}`);
  }

  if (ctx.pinned.length) {
    parts.push(`# Pinned moments (always true)\n- ${ctx.pinned.join("\n- ")}`);
  }

  const s = ctx.settings;
  parts.push(
    `# Style\n${LENGTH_HINT[s.responseLength]}\n${NARRATION_HINT[s.narration]}\nCreative intensity: ${s.wildness}/10 — ${
      s.wildness >= 8
        ? "take bold risks, introduce twists and surprises"
        : s.wildness >= 5
          ? "stay grounded but keep the scene moving with new details"
          : "stay steady, consistent and low-key"
    }.${s.extraInstruction ? `\nUser's extra direction: ${s.extraInstruction}` : ""}`,
  );

  return parts.join("\n\n");
}

export function matchLore(
  entries: Array<{ keywords: string[]; content: string; always_on: boolean }>,
  recentText: string,
): string[] {
  const haystack = recentText.toLowerCase();
  return entries
    .filter(
      (e) =>
        e.always_on ||
        e.keywords.some((k) => k.trim().length > 1 && haystack.includes(k.trim().toLowerCase())),
    )
    .map((e) => e.content)
    .filter(Boolean);
}

export const SUMMARY_INSTRUCTIONS = `You are a story archivist for a roleplay. Merge the previous summary with the new messages into one updated summary.
Rules:
- Write terse bullet points, newest events last.
- Track: who is present, relationships and how they changed, promises, injuries, locations, unresolved threads, and key objects.
- Keep it under 300 words. Output only the bullet list, no preamble.`;
