import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Plus, Sparkle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/lib/media";
import { startChat } from "@/lib/start-chat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Your chats — Thundr AI roleplay" },
      {
        name: "description",
        content:
          "Pick up any roleplay where you left off, or start a new story with one of your characters on Thundr.",
      },
      { property: "og:title", content: "Your chats — Thundr" },
      {
        property: "og:description",
        content: "Continue a story or start a new one with your characters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatsPage,
});

function ChatsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState(false);

  const { data: chats = [] } = useQuery({
    queryKey: ["chats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("id, title, summary, updated_at, characters(name, avatar_url)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: characters = [] } = useQuery({
    queryKey: ["characters", "pickable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("id, name, tagline, avatar_url")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const begin = useMutation({
    mutationFn: async (characterId: string) => {
      if (!user) throw new Error("Not signed in");
      return startChat(user.id, characterId);
    },
    onSuccess: (chatId) => {
      setPicker(false);
      navigate({ to: "/chat/$chatId", params: { chatId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chats").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader
        title="Your chats"
        subtitle="Every story you've started, newest first."
        action={
          <Button onClick={() => setPicker(true)}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
        }
      />

      {chats.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          <h2 className="font-display text-xl font-semibold">No stories yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Build a character first, then open a chat and start the scene.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/characters">
                <Sparkle className="h-4 w-4" /> Build a character
              </Link>
            </Button>
            {characters.length ? (
              <Button variant="secondary" onClick={() => setPicker(true)}>
                Start a chat
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40"
            >
              <ChatAvatar path={chat.characters?.avatar_url ?? null} />
              <Link
                to="/chat/$chatId"
                params={{ chatId: chat.id }}
                className="min-w-0 flex-1"
              >
                <h3 className="font-display text-lg leading-tight font-semibold">
                  {chat.title || chat.characters?.name || "Untitled story"}
                </h3>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {chat.summary || "No summary yet — keep the story going."}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove.mutate(chat.id)}
                aria-label="Delete chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Who do you want to talk to?</DialogTitle>
          </DialogHeader>
          {characters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no characters yet.{" "}
              <Link to="/characters" className="text-primary underline">
                Build one first
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-2">
              {characters.map((character) => (
                <button
                  key={character.id}
                  onClick={() => begin.mutate(character.id)}
                  disabled={begin.isPending}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50"
                >
                  <ChatAvatar path={character.avatar_url} />
                  <span className="min-w-0">
                    <span className="block font-medium">{character.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {character.tagline}
                    </span>
                  </span>
                  <MessagesSquare className="ml-auto h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ChatAvatar({ path }: { path: string | null }) {
  const url = useSignedUrl(path);
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary/40">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Sparkle className="h-5 w-5 text-muted-foreground" />
      )}
    </span>
  );
}
