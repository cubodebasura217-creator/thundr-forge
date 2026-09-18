export function describeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("402") || lower.includes("credit")) {
    return "AI credits have run out. Add credits, then try again.";
  }
  if (lower.includes("429") || lower.includes("rate")) {
    return "Thundr is receiving too many requests. Wait a moment, then retry.";
  }
  if (/\b5\d\d\b/.test(lower) || lower.includes("temporar") || lower.includes("upstream")) {
    return "The AI service is temporarily unavailable. Please retry.";
  }
  return message || "Something went wrong. Please try again.";
}