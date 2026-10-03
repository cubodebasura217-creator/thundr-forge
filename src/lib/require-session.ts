import { redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/** Route guard: sends signed-out visitors to /auth before any page queries run. */
export async function requireSession() {
  if (typeof window === "undefined") return;
  let hasSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasSession = !!data.session;
  } catch {
    hasSession = false;
  }
  if (!hasSession) throw redirect({ to: "/auth", replace: true });
}
