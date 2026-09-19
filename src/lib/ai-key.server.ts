import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { LOVABLE_CONFIG, type AiConfig } from "@/lib/ai.server";

/** Reads the caller's own API key (if they saved one) and picks the service to use. */
export async function loadAiConfig(supabase: SupabaseClient<Database>): Promise<AiConfig> {
  const { data } = await supabase
    .from("user_ai_keys")
    .select("provider, api_key")
    .maybeSingle();

  const key = (data?.api_key ?? "").trim();
  const provider = data?.provider;
  if (!key) return LOVABLE_CONFIG;
  if (provider === "gemini" || provider === "openrouter") return { provider, apiKey: key };
  return LOVABLE_CONFIG;
}
