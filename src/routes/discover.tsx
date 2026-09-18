import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { describeAiError } from "@/lib/ai-errors";
import { generateImage, suggestContent } from "@/lib/ai.functions";
import { uploadBase64Image } from "@/lib/media";
import { startChat } from "@/lib/start-chat";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover new stories — Thundr" },
      { name: "description", content: "Discover AI-recommended companions and story scenarios inspired by your Thundr characters and worlds." },
      { property: "og:title", content: "Discover new stories — Thundr" },
      { property: "og:description", content: "Fresh companions and scenarios shaped around your worlds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoverPage,
});

type Suggestion = Awaited<ReturnType<typeof suggestContent>>[number];

function DiscoverPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const source = useQuery({
    queryKey: ["discover-source", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [characters, worlds] = await Promise.all([
        supabase.from("characters").select("name, description").eq("user_id", user?.id ?? ""),
        supabase.from("worlds").select("name, overview").eq("user_id", user?.id ?? ""),
      ]);
      if (characters.error) throw characters.error;
      if (worlds.error) throw worlds.error;
      return { characters: characters.data ?? [], worlds: worlds.data ?? [] };
    },
  });

  const refresh = useMutation({
    mutationFn: async () => suggestContent({ data: source.data ?? { characters: [], worlds: [] } }),
    onSuccess: setSuggestions,
  });

  const useIdea = useMutation({
    mutationFn: async ({ suggestion, start }: { suggestion: Suggestion; start: boolean }) => {
      if (!user) throw new Error("Not signed in");
      const { base64 } = await generateImage({ data: { prompt: suggestion.image_prompt, kind: "avatar" } });
      const avatar_url = await uploadBase64Image(user.id, base64, "avatars");
      const { data, error } = await supabase.from("characters").insert({
        user_id: user.id,
        name: suggestion.title,
        tagline: suggestion.tagline,
        description: suggestion.description,
        greeting: suggestion.greeting,
        avatar_url,
        is_public: false,
      }).select("id").single();
      if (error) throw error;
      if (!start) return null;
      return startChat(user.id, data.id);
    },
    onSuccess: (chatId) => {
      if (chatId) navigate({ to: "/chat/$chatId", params: { chatId } });
      else toast.success("Companion saved to your characters");
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Discover"
        subtitle="Fresh companions and story sparks shaped by the characters and worlds you already love."
        action={<Button onClick={() => refresh.mutate()} disabled={refresh.isPending || source.isLoading}><RefreshCw className="h-4 w-4" />{refresh.isPending ? "Dreaming…" : suggestions.length ? "Refresh" : "Find ideas"}</Button>}
      />
      {refresh.error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Discover couldn’t refresh</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3"><span>{describeAiError(refresh.error)}</span><Button size="sm" variant="secondary" onClick={() => refresh.mutate()}>Retry</Button></AlertDescription>
        </Alert>
      ) : null}
      {!suggestions.length && !refresh.isPending ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-xl font-bold">Your next story starts here</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Thundr will remix themes from your creations into new companions and playable openings.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((suggestion, index) => (
            <article key={`${suggestion.title}-${index}`} className="flex flex-col rounded-2xl border border-border bg-card/70 p-5">
              <div className="flex items-center justify-between gap-3"><Badge variant="secondary">{suggestion.type === "scenario" ? <BookOpen className="mr-1 h-3 w-3" /> : <UserRound className="mr-1 h-3 w-3" />}{suggestion.type}</Badge></div>
              <h2 className="mt-4 text-xl font-bold">{suggestion.title}</h2>
              <p className="text-sm text-primary">{suggestion.tagline}</p>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{suggestion.description}</p>
              <div className="mt-5 flex gap-2">
                <Button size="sm" onClick={() => useIdea.mutate({ suggestion, start: suggestion.type === "scenario" })} disabled={useIdea.isPending}>{suggestion.type === "scenario" ? "Start story" : "Save companion"}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}