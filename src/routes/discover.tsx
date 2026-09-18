import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessagesSquare, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { describeAiError } from "@/lib/ai-errors";
import { generateImage, suggestContent } from "@/lib/ai.functions";
import { uploadBase64Image, useSignedUrl } from "@/lib/media";
import { startChat } from "@/lib/start-chat";
import { cn } from "@/lib/utils";
import { GENDER_OPTIONS, TROPE_OPTIONS } from "@/routes/characters";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover companions — Thundr" },
      {
        name: "description",
        content:
          "Swipe through full-screen character cards, filter by gender and roleplay tropes, and start a story in one tap.",
      },
      { property: "og:title", content: "Discover companions — Thundr" },
      { property: "og:description", content: "Swipe a full-screen feed of roleplay companions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoverPage,
});

type FeedCharacter = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  avatar_url: string | null;
  gender: string | null;
  tags: string[] | null;
};

function DiscoverPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [gender, setGender] = useState("all");
  const [tags, setTags] = useState<string[]>([]);

  const feedQuery = useQuery({
    queryKey: ["discover-feed", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("id, name, tagline, description, avatar_url, gender, tags")
        .or(`is_public.eq.true,user_id.eq.${user?.id}`)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as FeedCharacter[];
    },
  });

  const items = useMemo(() => {
    const all = feedQuery.data ?? [];
    return all.filter((character) => {
      if (gender !== "all" && (character.gender ?? "") !== gender) return false;
      if (tags.length) {
        const own = (character.tags ?? []).map((t) => t.toLowerCase());
        if (!tags.every((tag) => own.includes(tag))) return false;
      }
      return true;
    });
  }, [feedQuery.data, gender, tags]);

  const begin = useMutation({
    mutationFn: async (characterId: string) => {
      if (!user) throw new Error("Not signed in");
      return startChat(user.id, characterId);
    },
    onSuccess: (chatId) => navigate({ to: "/chat/$chatId", params: { chatId } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const dream = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const [characters, worlds] = await Promise.all([
        supabase.from("characters").select("name, description").eq("user_id", user.id).limit(20),
        supabase.from("worlds").select("name, overview").eq("user_id", user.id).limit(20),
      ]);
      const ideas = await suggestContent({
        data: { characters: characters.data ?? [], worlds: worlds.data ?? [] },
      });
      const picks = ideas.slice(0, 3);
      for (const idea of picks) {
        const { base64 } = await generateImage({
          data: { prompt: idea.image_prompt, kind: "avatar" },
        });
        const avatar_url = await uploadBase64Image(user.id, base64, "avatars");
        await supabase.from("characters").insert({
          user_id: user.id,
          name: idea.title,
          tagline: idea.tagline,
          description: idea.description,
          greeting: idea.greeting,
          avatar_url,
          tags: tags.length ? tags : [],
          gender: gender === "all" ? "" : gender,
          is_public: false,
        });
      }
    },
    onSuccess: () => {
      feedQuery.refetch();
      toast.success("New companions added to your feed");
    },
  });

  return (
    <AppShell wide>
      <div className="relative h-[calc(100vh-4rem)] w-full">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
          <div className="pointer-events-auto mx-auto grid max-w-3xl gap-2 rounded-2xl border border-border/60 bg-background/70 p-2 backdrop-blur-xl">
            <div className="flex items-center gap-2">
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any gender</SelectItem>
                {GENDER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-1 gap-1 overflow-x-auto">
              {TROPE_OPTIONS.map((trope) => {
                const active = tags.includes(trope);
                return (
                  <button
                    key={trope}
                    type="button"
                    onClick={() =>
                      setTags(active ? tags.filter((t) => t !== trope) : [...tags, trope])
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                      active
                        ? "bg-neon-soft text-primary glow-ring"
                        : "bg-secondary/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {trope}
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="secondary" disabled={dream.isPending} onClick={() => dream.mutate()}>
              <Wand2 className="h-4 w-4" />
              {dream.isPending ? "Dreaming…" : "Dream up more"}
            </Button>
          </div>
          {dream.error ? (
            <Alert variant="destructive" className="pointer-events-auto mx-auto mt-2 max-w-3xl">
              <AlertTitle>Couldn’t dream up new companions</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{describeAiError(dream.error)}</span>
                <Button size="sm" variant="secondary" onClick={() => dream.mutate()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <h1 className="mt-4 font-display text-xl font-bold">Nothing matches yet</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Clear a filter, create a character, or let Thundr dream up a few companions for you.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full snap-y snap-mandatory overflow-y-auto">
            {items.map((character) => (
              <FeedCard
                key={character.id}
                character={character}
                busy={begin.isPending}
                onChat={() => begin.mutate(character.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FeedCard({
  character,
  busy,
  onChat,
}: {
  character: FeedCharacter;
  busy: boolean;
  onChat: () => void;
}) {
  const url = useSignedUrl(character.avatar_url);
  return (
    <section className="relative flex h-[calc(100vh-4rem)] w-full snap-start snap-always items-end overflow-hidden">
      {url ? (
        <img src={url} alt={`${character.name} portrait`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-secondary/30">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="relative z-10 w-full max-w-2xl p-6 pb-16">
        <h2 className="font-display text-3xl font-bold">{character.name}</h2>
        {character.tagline ? <p className="mt-1 text-sm text-primary">{character.tagline}</p> : null}
        <p className="mt-3 line-clamp-5 text-sm text-muted-foreground">
          {character.description || "No description yet."}
        </p>
        {character.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-1">
            {character.tags.slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-full bg-neon-soft px-2 py-0.5 text-xs text-primary">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <Button className="mt-5" size="lg" disabled={busy} onClick={onChat}>
          <MessagesSquare className="h-4 w-4" /> Chat now
        </Button>
      </div>
    </section>
  );
}
