import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Globe2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/worlds")({
  head: () => ({
    meta: [
      { title: "Worlds and lorebooks — Thundr" },
      {
        name: "description",
        content:
          "Build worlds with keyword-triggered lorebook entries so your characters remember the places, factions and rules of your setting.",
      },
      { property: "og:title", content: "Worlds and lorebooks — Thundr" },
      { property: "og:description", content: "Lore that shows up exactly when it matters." },
    ],
  }),
  component: WorldsPage,
});

function WorldsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [worldOpen, setWorldOpen] = useState(false);
  const [worldForm, setWorldForm] = useState<{ id?: string; name: string; overview: string }>({
    name: "",
    overview: "",
  });
  const [activeWorld, setActiveWorld] = useState<string | null>(null);

  const { data: worlds = [] } = useQuery({
    queryKey: ["worlds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worlds")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const saveWorld = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (worldForm.id) {
        const { error } = await supabase
          .from("worlds")
          .update({ name: worldForm.name, overview: worldForm.overview })
          .eq("id", worldForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("worlds")
          .insert({ user_id: user.id, name: worldForm.name, overview: worldForm.overview });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worlds"] });
      setWorldOpen(false);
      setWorldForm({ name: "", overview: "" });
      toast.success("World saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeWorld = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worlds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worlds"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader
        title="Worlds"
        subtitle="A world holds your setting plus lorebook entries that get pulled into a chat when their keywords come up."
        action={
          <Button
            onClick={() => {
              setWorldForm({ name: "", overview: "" });
              setWorldOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New world
          </Button>
        }
      />

      {worlds.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          <h2 className="font-display text-xl font-semibold">No worlds yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Worlds keep your setting consistent. Add an overview, then drop in lore entries for
            places, factions, rules and history.
          </p>
          <Button className="mt-6" onClick={() => setWorldOpen(true)}>
            <Plus className="h-4 w-4" /> Create your first world
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {worlds.map((world) => (
            <div key={world.id} className="rounded-2xl border border-border bg-card/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-neon-soft text-primary">
                    <Globe2 className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{world.name}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeWorld.mutate(world.id)}
                  aria-label={`Delete ${world.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                {world.overview || "No overview yet."}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setWorldForm({ id: world.id, name: world.name, overview: world.overview });
                    setWorldOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveWorld(world.id)}>
                  <BookOpen className="h-4 w-4" /> Lorebook
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={worldOpen} onOpenChange={setWorldOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{worldForm.id ? "Edit world" : "New world"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="w-name">Name</Label>
              <Input
                id="w-name"
                value={worldForm.name}
                onChange={(e) => setWorldForm({ ...worldForm, name: e.target.value })}
                placeholder="The Verge Cities"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-overview">Overview</Label>
              <Textarea
                id="w-overview"
                rows={6}
                value={worldForm.overview}
                onChange={(e) => setWorldForm({ ...worldForm, overview: e.target.value })}
                placeholder="Floating cities strung along a storm belt; airship guilds run everything."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveWorld.mutate()}
              disabled={!worldForm.name.trim() || saveWorld.isPending}
            >
              Save world
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LorebookDialog worldId={activeWorld} onClose={() => setActiveWorld(null)} />
    </AppShell>
  );
}

function LorebookDialog({
  worldId,
  onClose,
}: {
  worldId: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [keywords, setKeywords] = useState("");
  const [content, setContent] = useState("");
  const [alwaysOn, setAlwaysOn] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["world_entries", worldId],
    enabled: Boolean(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("world_entries")
        .select("*")
        .eq("world_id", worldId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      if (!user || !worldId) throw new Error("Not ready");
      const { error } = await supabase.from("world_entries").insert({
        world_id: worldId,
        user_id: user.id,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        content,
        always_on: alwaysOn,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world_entries", worldId] });
      setKeywords("");
      setContent("");
      setAlwaysOn(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("world_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["world_entries", worldId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(worldId)} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lorebook</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entries yet. Add lore with keywords — when those words show up in the chat, the
              entry is handed to the character.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-surface/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-1">
                    {entry.always_on ? (
                      <span className="rounded-full bg-neon-soft px-2 py-0.5 text-xs text-primary">
                        always on
                      </span>
                    ) : null}
                    {(entry.keywords ?? []).map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEntry.mutate(entry.id)}
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{entry.content}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-2 space-y-3 rounded-xl border border-border bg-card/60 p-4">
          <div className="space-y-2">
            <Label htmlFor="e-keys">Keywords (comma separated)</Label>
            <Input
              id="e-keys"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="storm belt, skyport, guild"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-content">Lore</Label>
            <Textarea
              id="e-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The storm belt never sleeps; crossing it without a guild pass is a death sentence."
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="e-always" checked={alwaysOn} onCheckedChange={setAlwaysOn} />
            <Label htmlFor="e-always" className="text-sm text-muted-foreground">
              Always include this entry
            </Label>
          </div>
          <Button
            onClick={() => addEntry.mutate()}
            disabled={!content.trim() || addEntry.isPending}
            size="sm"
          >
            <Plus className="h-4 w-4" /> Add entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
