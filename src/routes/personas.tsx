import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/personas")({
  head: () => ({
    meta: [
      { title: "Your personas — Thundr" },
      {
        name: "description",
        content:
          "Create and switch between roleplay personas with their own name, description, voice and story preferences.",
      },
      { property: "og:title", content: "Your personas — Thundr" },
      { property: "og:description", content: "Switch who you are in every story." },
    ],
  }),
  component: PersonasPage,
});

type PersonaForm = {
  id?: string;
  name: string;
  description: string;
  avatar_url: string | null;
};

const EMPTY: PersonaForm = { name: "", description: "", avatar_url: null };

function PersonasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PersonaForm>(EMPTY);

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personas")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: PersonaForm) => {
      if (!user) throw new Error("Not signed in");
      if (values.id) {
        const { error } = await supabase
          .from("personas")
          .update({
            name: values.name,
            description: values.description,
            avatar_url: values.avatar_url,
          })
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personas").insert({
          user_id: user.id,
          name: values.name,
          description: values.description,
          avatar_url: values.avatar_url,
          is_active: personas.length === 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      setOpen(false);
      setForm(EMPTY);
      toast.success("Persona saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      await supabase.from("personas").update({ is_active: false }).eq("user_id", user.id);
      const { error } = await supabase.from("personas").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personas"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personas"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader
        title="Personas"
        subtitle="Who you are in the story. Switch any time — each chat remembers the persona you used."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(EMPTY)}>
                <Plus className="h-4 w-4" /> New persona
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit persona" : "New persona"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Kael Ryder"
                  />
                </div>
                {user ? (
                  <div className="flex items-center gap-3">
                    <PersonaAvatar path={form.avatar_url} name={form.name} />
                    <ImageUploadButton
                      userId={user.id}
                      folder="personas"
                      onUploaded={(path) => setForm({ ...form, avatar_url: path })}
                      onError={(error) => toast.error(error.message)}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea
                    id="p-desc"
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="A drifting sky-courier with a stolen map and too many debts."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => save.mutate(form)}
                  disabled={!form.name.trim() || save.isPending}
                >
                  Save persona
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {personas.length === 0 ? (
        <EmptyState onCreate={() => setOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className={cn(
                "rounded-2xl border border-border bg-card/70 p-5 transition-shadow",
                persona.is_active && "glow-ring border-primary/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PersonaAvatar path={persona.avatar_url} name={persona.name} />
                  <div>
                    <h3 className="font-display text-lg leading-tight font-semibold">
                      {persona.name}
                    </h3>
                    {persona.is_active ? (
                      <span className="text-xs text-primary">Active</span>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(persona.id)}
                  aria-label={`Delete ${persona.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
                {persona.description || "No description yet."}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setForm({
                      id: persona.id,
                      name: persona.name,
                      description: persona.description,
                      avatar_url: persona.avatar_url,
                    });
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                {!persona.is_active ? (
                  <Button size="sm" onClick={() => activate.mutate(persona.id)}>
                    <Check className="h-4 w-4" /> Use this
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PersonaAvatar({ path, name }: { path: string | null; name: string }) {
  const url = useSignedUrl(path);
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-neon-soft text-primary">
      {url ? <img src={url} alt={`${name} avatar`} className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4" />}
    </span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
      <h2 className="font-display text-xl font-semibold">No personas yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        A persona is the character you play. Give them a name and a few lines of background and
        every chat will treat you as them.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="h-4 w-4" /> Create your first persona
      </Button>
    </div>
  );
}
