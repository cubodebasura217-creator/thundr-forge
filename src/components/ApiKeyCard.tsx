import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/** Lets a signed-in user pick the built-in AI or bring their own Gemini/OpenRouter key. */
export function ApiKeyCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("lovable");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gemini-1.5-flash");
  const [loaded, setLoaded] = useState(false);

  const stored = useQuery({
    queryKey: ["ai-key", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_ai_keys")
        .select("provider, api_key, model")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? { provider: "lovable", api_key: "", model: "" };
    },
  });

  useEffect(() => {
    if (!stored.data || loaded) return;
    setProvider(stored.data.provider || "lovable");
    setKey(stored.data.api_key || "");
    setModel(stored.data.model === "gemini-2.0-flash" ? "gemini-2.0-flash" : "gemini-1.5-flash");
    setLoaded(true);
  }, [stored.data, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first");
      const trimmed = key.trim();
      const { error } = await supabase.from("user_ai_keys").upsert({
        user_id: user.id,
        provider: trimmed ? provider : "lovable",
        api_key: trimmed && provider !== "lovable" ? trimmed : "",
        model: provider === "gemini" ? model : "",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-key", user?.id] });
      toast.success(
        provider === "lovable" || !key.trim()
          ? "Using the built-in AI"
          : "Your own key is now in use",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
      <div>
        <p className="text-sm">Use your own AI key</p>
        <p className="text-xs text-muted-foreground">
          Optional. Leave this on the built-in AI unless you want chats billed to your own account.
        </p>
      </div>

      <Select value={provider} onValueChange={setProvider}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="lovable">Built-in AI (default)</SelectItem>
          <SelectItem value="gemini">My Gemini key</SelectItem>
          <SelectItem value="openrouter">My OpenRouter key</SelectItem>
        </SelectContent>
      </Select>

      {provider !== "lovable" && (
        <div className="space-y-2">
          {provider === "gemini" && (
            <div className="space-y-2">
              <Label htmlFor="gemini-model">Gemini model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="gemini-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (default)</SelectItem>
                  <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Both are on Google's free tier. 1.5 Flash is the default.
              </p>
            </div>
          )}
          <Label htmlFor="own-key">API key</Label>
          <Input
            id="own-key"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={provider === "gemini" ? "AIza..." : "sk-or-..."}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {provider === "gemini"
              ? `Get a key at aistudio.google.com — it runs your chats on ${model === "gemini-2.0-flash" ? "Gemini 2.0 Flash" : "Gemini 1.5 Flash"} (free tier).`
              : "Get a key at openrouter.ai — it runs your chats on Gemini 2.5 Flash via OpenRouter."}
          </p>
        </div>
      )}

      <Button
        size="sm"
        className="w-full"
        disabled={save.isPending || (provider !== "lovable" && !key.trim())}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save key setting"}
      </Button>
    </div>
  );
}
