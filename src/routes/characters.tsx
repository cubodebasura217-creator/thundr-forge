import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Lock, MessagesSquare, Plus, Sparkle, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { draftCharacter, generateImage } from "@/lib/ai.functions";
import { uploadBase64Image, useSignedUrl } from "@/lib/media";
import { startChat } from "@/lib/start-chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Character builder — Thundr" },
      {
        name: "description",
        content:
          "Build roleplay characters with a portrait, personality traits, greeting and director notes, then link them to your worlds and start a story.",
      },
      { property: "og:title", content: "Character builder — Thundr" },
      {
        property: "og:description",
        content: "Design a character, link a world, and roleplay with them instantly.",
      },
    ],
  }),
  component: CharactersPage,
});

type CharacterForm = {
  id?: string;
  name: string;
  tagline: string;
  description: string;
  greeting: string;
  traitsText: string;
  system_prompt: string;
  example_dialogue: string;
  avatar_url: string | null;
  is_public: boolean;
  worldIds: string[];
};

const EMPTY: CharacterForm = {
  name: "",
  tagline: "",
  description: "",
  greeting: "",
  traitsText: "",
  system_prompt: "",
  example_dialogue: "",
  avatar_url: null,
  is_public: false,
  worldIds: [],
};

function CharactersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CharacterForm>(EMPTY);

  const { data: mine = [] } = useQuery({
    queryKey: ["characters", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: discover = [] } = useQuery({
    queryKey: ["characters", "public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const { data: worlds = [] } = useQuery({
    queryKey: ["worlds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worlds")
        .select("id, name")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: CharacterForm) => {
      if (!user) throw new Error("Not signed in");
      const traits = values.traitsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        name: values.name.trim(),
        tagline: values.tagline,
        description: values.description,
        greeting: values.greeting,
        traits,
        system_prompt: values.system_prompt,
        example_dialogue: values.example_dialogue,
        avatar_url: values.avatar_url,
        is_public: values.is_public,
      };

      let characterId = values.id;
      if (characterId) {
        const { error } = await supabase
          .from("characters")
          .update(payload)
          .eq("id", characterId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("characters")
          .insert({ ...payload, user_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        characterId = data.id;
      }

      await supabase.from("character_worlds").delete().eq("character_id", characterId);
      if (values.worldIds.length) {
        const { error } = await supabase.from("character_worlds").insert(
          values.worldIds.map((world_id) => ({
            character_id: characterId!,
            world_id,
            user_id: user.id,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      setOpen(false);
      setForm(EMPTY);
      toast.success("Character saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("characters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["characters"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const draft = useMutation({
    mutationFn: async (idea: string) => draftCharacter({ data: { idea } }),
    onSuccess: (result) => {
      setForm((prev) => ({
        ...prev,
        name: result.name || prev.name,
        tagline: result.tagline,
        description: result.description,
        greeting: result.greeting,
        traitsText: result.traits.join(", "),
        system_prompt: result.system_prompt,
        example_dialogue: result.example_dialogue,
      }));
      toast.success("Draft ready — edit anything you like");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const makeAvatar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const prompt = [form.name, form.tagline, form.description].filter(Boolean).join(". ");
      if (prompt.trim().length < 3) throw new Error("Add a name or description first");
      const { base64 } = await generateImage({ data: { prompt, kind: "avatar" } });
      return uploadBase64Image(user.id, base64, "avatars");
    },
    onSuccess: (path) => {
      setForm((prev) => ({ ...prev, avatar_url: path }));
      toast.success("Portrait generated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const begin = useMutation({
    mutationFn: async (characterId: string) => {
      if (!user) throw new Error("Not signed in");
      return startChat(user.id, characterId);
    },
    onSuccess: (chatId) => navigate({ to: "/chat/$chatId", params: { chatId } }),
    onError: (error: Error) => toast.error(error.message),
  });

  async function openEditor(id?: string) {
    if (!id) {
      setForm(EMPTY);
      setOpen(true);
      return;
    }
    const character = mine.find((c) => c.id === id);
    if (!character) return;
    const { data: links } = await supabase
      .from("character_worlds")
      .select("world_id")
      .eq("character_id", id);
    setForm({
      id: character.id,
      name: character.name,
      tagline: character.tagline,
      description: character.description,
      greeting: character.greeting,
      traitsText: character.traits.join(", "),
      system_prompt: character.system_prompt,
      example_dialogue: character.example_dialogue,
      avatar_url: character.avatar_url,
      is_public: character.is_public,
      worldIds: (links ?? []).map((l) => l.world_id),
    });
    setOpen(true);
  }

  return (
    <AppShell>
      <PageHeader
        title="Characters"
        subtitle="Design who you talk to. Give them a voice, a look, and a world to live in."
        action={
          <Button onClick={() => openEditor()}>
            <Plus className="h-4 w-4" /> New character
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList className="mb-6">
          <TabsTrigger value="mine">Yours</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          {mine.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
              <h2 className="font-display text-xl font-semibold">No characters yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Describe an idea in one line and let Thundr draft the rest, or write every detail
                yourself.
              </p>
              <Button className="mt-6" onClick={() => openEditor()}>
                <Sparkle className="h-4 w-4" /> Create your first character
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  onChat={() => begin.mutate(character.id)}
                  onEdit={() => openEditor(character.id)}
                  onDelete={() => remove.mutate(character.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="discover">
          {discover.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shared characters yet. Make one public and it shows up here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {discover.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  onChat={() => begin.mutate(character.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit character" : "New character"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <Label htmlFor="idea">Start from an idea</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="idea"
                  placeholder="A retired storm-caller who runs a lighthouse tavern"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      draft.mutate((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={draft.isPending}
                  onClick={() => {
                    const el = document.getElementById("idea") as HTMLInputElement | null;
                    if (el?.value) draft.mutate(el.value);
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                  {draft.isPending ? "Drafting…" : "Draft"}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <AvatarPreview path={form.avatar_url} name={form.name} />
              <div className="flex-1 space-y-2">
                <Label htmlFor="c-name">Name</Label>
                <Input
                  id="c-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nyx Vale"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={makeAvatar.isPending}
                  onClick={() => makeAvatar.mutate()}
                >
                  <Sparkle className="h-4 w-4" />
                  {makeAvatar.isPending ? "Painting…" : "Generate portrait"}
                </Button>
              </div>
            </div>

            <Field label="Tagline" id="c-tag">
              <Input
                id="c-tag"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                placeholder="Storm-caller with a grudge"
              />
            </Field>

            <Field label="Description" id="c-desc">
              <Textarea
                id="c-desc"
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Who they are, how they look, what they want."
              />
            </Field>

            <Field label="Greeting (their first message)" id="c-greet">
              <Textarea
                id="c-greet"
                rows={3}
                value={form.greeting}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              />
            </Field>

            <Field label="Personality traits (comma separated)" id="c-traits">
              <Input
                id="c-traits"
                value={form.traitsText}
                onChange={(e) => setForm({ ...form, traitsText: e.target.value })}
                placeholder="wry, protective, reckless"
              />
            </Field>

            <Field label="Director notes / system prompt" id="c-sys">
              <Textarea
                id="c-sys"
                rows={4}
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="How the story should be told, hard rules, things they never do."
              />
            </Field>

            <Field label="Example dialogue" id="c-ex">
              <Textarea
                id="c-ex"
                rows={3}
                value={form.example_dialogue}
                onChange={(e) => setForm({ ...form, example_dialogue: e.target.value })}
              />
            </Field>

            {worlds.length ? (
              <div className="space-y-2">
                <Label>Linked worlds</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {worlds.map((world) => {
                    const checked = form.worldIds.includes(world.id);
                    return (
                      <label
                        key={world.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            setForm({
                              ...form,
                              worldIds: next
                                ? [...form.worldIds, world.id]
                                : form.worldIds.filter((id) => id !== world.id),
                            })
                          }
                        />
                        {world.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <label className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-3">
              <span className="text-sm">
                Share publicly
                <span className="block text-xs text-muted-foreground">
                  Other Thundr members can start chats with them.
                </span>
              </span>
              <Switch
                checked={form.is_public}
                onCheckedChange={(next) => setForm({ ...form, is_public: next })}
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.name.trim() || save.isPending}
            >
              Save character
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AvatarPreview({ path, name }: { path: string | null; name: string }) {
  const url = useSignedUrl(path);
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-secondary/40">
      {url ? (
        <img src={url} alt={name ? `${name} portrait` : "Character portrait"} className="h-full w-full object-cover" />
      ) : (
        <Sparkle className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}

type CharacterRow = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  traits: string[];
  avatar_url: string | null;
  is_public: boolean;
};

function CharacterCard({
  character,
  onChat,
  onEdit,
  onDelete,
}: {
  character: CharacterRow;
  onChat: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const url = useSignedUrl(character.avatar_url);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/70">
      <div className="relative h-40 bg-secondary/40">
        {url ? (
          <img src={url} alt={`${character.name} portrait`} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center">
            <Sparkle className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
          {character.is_public ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {character.is_public ? "Public" : "Private"}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold">{character.name}</h3>
        <p className="text-xs text-primary">{character.tagline}</p>
        <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
          {character.description || "No description yet."}
        </p>
        {character.traits.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {character.traits.slice(0, 4).map((trait) => (
              <span
                key={trait}
                className={cn("rounded-full bg-neon-soft px-2 py-0.5 text-xs text-primary")}
              >
                {trait}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={onChat}>
            <MessagesSquare className="h-4 w-4" /> Chat
          </Button>
          {onEdit ? (
            <Button size="sm" variant="secondary" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              aria-label={`Delete ${character.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
