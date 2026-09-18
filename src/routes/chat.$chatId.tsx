import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Image as ImageIcon,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  ScrollText,
  Send,
  Settings2,
  Sparkle,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { RoleplayText } from "@/components/RoleplayText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { generateImage, summarizeChat } from "@/lib/ai.functions";
import { describeAiError } from "@/lib/ai-errors";
import { uploadBase64Image, useSignedUrl } from "@/lib/media";
import { DEFAULT_SETTINGS, parseSettings, type ChatSettings } from "@/lib/prompt";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Roleplay chat — Thundr" },
      {
        name: "description",
        content:
          "Roleplay in a live chat: edit any message, regenerate replies and swipe alternatives, pin key moments and keep long stories in memory.",
      },
      { property: "og:title", content: "Roleplay chat — Thundr" },
      {
        property: "og:description",
        content: "Edit, regenerate, pin and remember — a roleplay chat built for long stories.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type Variant = { id: string; idx: number; content: string };
type ChatMessage = {
  id: string;
  role: string;
  content: string;
  is_pinned: boolean;
  active_variant: number;
  created_at: string;
  message_variants: Variant[];
};

function ChatPage() {
  const { chatId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [scenePrompt, setScenePrompt] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<{ path: string; prompt: string } | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const touchStart = useRef<{ id: string; x: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatQuery = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("*, characters(id, name, avatar_url, greeting), personas(id, name, description, avatar_url)")
        .eq("id", chatId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", chatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, is_pinned, active_variant, created_at, message_variants(id, idx, content)")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  const imagesQuery = useQuery({
    queryKey: ["chat-images", chatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_images")
        .select("id, path, prompt")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const personasQuery = useQuery({
    queryKey: ["personas", "chat", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("personas").select("id, name, description, avatar_url").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const chat = chatQuery.data;
  const messages = messagesQuery.data ?? [];
  const settings: ChatSettings = chat ? parseSettings(chat.settings) : DEFAULT_SETTINGS;
  const characterName = chat?.characters?.name ?? "Character";
  const avatarPath = chat?.characters?.avatar_url ?? null;
  const backgroundUrl = useSignedUrl(chat?.background_path);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  useEffect(() => setSummaryDraft(chat?.summary ?? ""), [chat?.summary]);

  const refreshMessages = () =>
    queryClient.invalidateQueries({ queryKey: ["messages", chatId] });

  /** Streams one reply from the model, returning the finished text. */
  async function streamReply(excludeMessageIds: string[] = []) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your session expired — sign in again.");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chatId, excludeMessageIds }),
    });
    if (!res.ok || !res.body) {
      throw new Error((await res.text()) || "The reply failed to generate.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    setStreaming("");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      setStreaming(text);
    }
    setStreaming(null);
    if (!text.trim()) throw new Error("The model returned an empty reply.");
    return text.trim();
  }

  async function maybeSummarize(total: number) {
    if (!settings.autoSummary) return;
    const folded = chat?.summarized_count ?? 0;
    if (total - folded < 20) return;
    try {
      await summarizeChat({ data: { chatId } });
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    } catch {
      /* summaries are best-effort */
    }
  }

  async function addAssistantMessage(text: string) {
    if (!user) return;
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, user_id: user.id, role: "assistant", content: text })
      .select("id")
      .single();
    if (error) throw error;
    await supabase
      .from("message_variants")
      .insert({ message_id: inserted.id, user_id: user.id, idx: 0, content: text });
  }

  const send = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("Not signed in");
      setReplyError(null);
      setBusy(true);
      const { error } = await supabase
        .from("messages")
        .insert({ chat_id: chatId, user_id: user.id, role: "user", content });
      if (error) throw error;
      await refreshMessages();
      const text = await streamReply();
      await addAssistantMessage(text);
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
      await refreshMessages();
      await maybeSummarize(messages.length + 2);
    },
    onError: (error: Error) => setReplyError(describeAiError(error)),
    onSettled: () => {
      setBusy(false);
      setStreaming(null);
    },
  });

  const regenerate = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Not signed in");
      setReplyError(null);
      setBusy(true);
      const target = messages.find((m) => m.id === messageId);
      const text = await streamReply([messageId]);
      const nextIdx = (target?.message_variants.length ?? 1);
      const { error } = await supabase
        .from("message_variants")
        .insert({ message_id: messageId, user_id: user.id, idx: nextIdx, content: text });
      if (error) throw error;
      const { error: updateError } = await supabase
        .from("messages")
        .update({ content: text, active_variant: nextIdx })
        .eq("id", messageId);
      if (updateError) throw updateError;
      await refreshMessages();
    },
    onError: (error: Error) => setReplyError(describeAiError(error)),
    onSettled: () => {
      setBusy(false);
      setStreaming(null);
    },
  });

  const retryReply = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      setReplyError(null);
      setBusy(true);
      const text = await streamReply();
      await addAssistantMessage(text);
      await refreshMessages();
    },
    onError: (error: Error) => setReplyError(describeAiError(error)),
    onSettled: () => {
      setBusy(false);
      setStreaming(null);
    },
  });

  const swipe = useMutation({
    mutationFn: async ({ message, dir }: { message: ChatMessage; dir: -1 | 1 }) => {
      const variants = [...message.message_variants].sort((a, b) => a.idx - b.idx);
      if (variants.length < 2) return;
      const current = variants.findIndex((v) => v.idx === message.active_variant);
      const base = current === -1 ? 0 : current;
      const next = (base + dir + variants.length) % variants.length;
      const variant = variants[next]!;
      const { error } = await supabase
        .from("messages")
        .update({ content: variant.content, active_variant: variant.idx })
        .eq("id", message.id);
      if (error) throw error;
      await refreshMessages();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveEdit = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const message = messages.find((m) => m.id === id);
      const { error } = await supabase.from("messages").update({ content }).eq("id", id);
      if (error) throw error;
      const active = message?.message_variants.find((v) => v.idx === message.active_variant);
      if (active) {
        await supabase.from("message_variants").update({ content }).eq("id", active.id);
      }
      await refreshMessages();
    },
    onSuccess: () => setEditing(null),
    onError: (error: Error) => toast.error(error.message),
  });

  const togglePin = useMutation({
    mutationFn: async (message: ChatMessage) => {
      const { error } = await supabase
        .from("messages")
        .update({ is_pinned: !message.is_pinned })
        .eq("id", message.id);
      if (error) throw error;
      await refreshMessages();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
      await refreshMessages();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateSettings = useMutation({
    mutationFn: async (next: ChatSettings) => {
      const { error } = await supabase.from("chats").update({ settings: next }).eq("id", chatId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateChat = useMutation({
    mutationFn: async (patch: { spicy?: boolean; persona_id?: string | null; background_path?: string | null; summary?: string }) => {
      const { error } = await supabase.from("chats").update(patch).eq("id", chatId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updatePersona = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      const { error } = await supabase.from("personas").update({ name, description }).eq("id", id);
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] }),
        queryClient.invalidateQueries({ queryKey: ["personas", "chat", user?.id] }),
      ]);
    },
    onSuccess: () => toast.success("Persona updated"),
    onError: (error: Error) => toast.error(error.message),
  });

  const summarizeNow = useMutation({
    mutationFn: async () => {
      setSummaryError(null);
      return summarizeChat({ data: { chatId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      toast.success("Story summary updated");
    },
    onError: (error: Error) => setSummaryError(describeAiError(error)),
  });

  const makeScene = useMutation({
    mutationFn: async (prompt: string) => {
      if (!user) throw new Error("Not signed in");
      setImageError(null);
      const { base64 } = await generateImage({ data: { prompt, kind: "scene" } });
      const path = await uploadBase64Image(user.id, base64, "scenes");
      const { error } = await supabase
        .from("chat_images")
        .insert({ chat_id: chatId, user_id: user.id, path, prompt });
      if (error) throw error;
    },
    onSuccess: () => {
      setScenePrompt(null);
      imagesQuery.refetch();
      setShowMemory(true);
      toast.success("Scene card added");
    },
    onError: (error: Error) => setImageError(describeAiError(error)),
  });

  const pinned = messages.filter((m) => m.is_pinned);

  if (chatQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading the story…</p>
      </AppShell>
    );
  }

  if (!chat) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <h1 className="font-display text-xl font-semibold">This chat is gone</h1>
          <Button asChild className="mt-4">
            <Link to="/">Back to your chats</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <div className="relative mx-auto flex h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden">
        {backgroundUrl ? (
          <div className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${backgroundUrl})` }} />
        ) : null}
        {backgroundUrl ? <div className="pointer-events-none absolute inset-0 z-0 bg-background/65" /> : null}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <CharacterAvatar path={avatarPath} name={characterName} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-lg font-semibold">{characterName}</h1>
            <Select value={chat.persona_id ?? "none"} onValueChange={(value) => updateChat.mutate({ persona_id: value === "none" ? null : value })}>
              <SelectTrigger className="mt-0.5 h-7 w-fit min-w-36 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none"><SelectValue placeholder="Choose persona" /></SelectTrigger>
              <SelectContent><SelectItem value="none">No persona</SelectItem>{personasQuery.data?.map((persona) => <SelectItem key={persona.id} value={persona.id}>You are {persona.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant={chat.spicy ? "default" : "ghost"} size="icon" onClick={() => updateChat.mutate({ spicy: !chat.spicy })} aria-label={chat.spicy ? "Disable spicy mode" : "Enable spicy mode"}><Flame className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setShowMemory(true)} aria-label="Story memory">
            <ScrollText className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} aria-label="Chat settings">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        {pinned.length ? (
          <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-secondary/20 px-4 py-2">
            {pinned.map((m) => (
              <span
                key={m.id}
                className="flex max-w-xs shrink-0 items-center gap-1 rounded-full bg-neon-soft px-3 py-1 text-xs text-primary"
              >
                <Pin className="h-3 w-3" />
                <span className="truncate">{m.content}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              The scene is empty. Say something to begin.
            </p>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === "user";
            const variants = [...message.message_variants].sort((a, b) => a.idx - b.idx);
            const position = Math.max(
              1,
              variants.findIndex((v) => v.idx === message.active_variant) + 1,
            );
            const isEditing = editing?.id === message.id;

            return (
              <div
                key={message.id}
                className={cn("group flex flex-col gap-2", isUser ? "items-end" : "items-start")}
              >
                <div className="flex max-w-[85%] items-end gap-2">
                  {!isUser ? <CharacterAvatar path={avatarPath} name={characterName} small /> : null}
                  <div
                    onTouchStart={(event) => { touchStart.current = { id: message.id, x: event.touches[0]?.clientX ?? 0 }; }}
                    onTouchEnd={(event) => {
                      if (isUser || touchStart.current?.id !== message.id) return;
                      const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStart.current.x;
                      touchStart.current = null;
                      if (delta < -60) {
                        if (position >= variants.length) regenerate.mutate(message.id);
                        else swipe.mutate({ message, dir: 1 });
                      } else if (delta > 60 && variants.length > 1) swipe.mutate({ message, dir: -1 });
                    }}
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                      isUser
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "border border-primary/25 bg-card/80 rounded-bl-sm glow-ring",
                    )}
                  >
                    {isEditing ? (
                      <div className="w-[min(70vw,32rem)] space-y-2">
                        <Textarea
                          rows={6}
                          value={editing.content}
                          onChange={(e) => setEditing({ id: message.id, content: e.target.value })}
                          className="text-foreground"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              saveEdit.mutate({ id: message.id, content: editing.content })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <RoleplayText>{message.content}</RoleplayText>
                    )}
                  </div>
                </div>

                {!isEditing ? (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!isUser && variants.length > 1 ? (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Previous version"
                          onClick={() => swipe.mutate({ message, dir: -1 })}
                        >
                          <ChevronLeft />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {position} / {variants.length}
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Next version"
                          onClick={() => swipe.mutate({ message, dir: 1 })}
                        >
                          <ChevronRight />
                        </Button>
                      </>
                    ) : null}
                    {!isUser ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Regenerate reply"
                        disabled={busy}
                        onClick={() => regenerate.mutate(message.id)}
                      >
                        <RefreshCw />
                      </Button>
                    ) : null}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Edit message"
                      onClick={() => setEditing({ id: message.id, content: message.content })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={message.is_pinned ? "Unpin message" : "Pin message"}
                      onClick={() => togglePin.mutate(message)}
                    >
                      {message.is_pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete message"
                      onClick={() => removeMessage.mutate(message.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {streaming !== null ? (
            <div className="flex max-w-[85%] items-end gap-2">
              <CharacterAvatar path={avatarPath} name={characterName} small />
              <div className="glow-ring rounded-2xl rounded-bl-sm border border-primary/25 bg-card/80 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {streaming ? <RoleplayText>{streaming}</RoleplayText> : <span className="text-muted-foreground">{characterName} is writing…</span>}
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border/70 bg-background/80 p-4 backdrop-blur">
          {replyError ? <Alert variant="destructive" className="mb-3"><AlertTitle>Reply interrupted</AlertTitle><AlertDescription className="flex items-center justify-between gap-3"><span>{replyError}</span><Button size="sm" variant="secondary" disabled={busy} onClick={() => retryReply.mutate()}>Retry</Button></AlertDescription></Alert> : null}
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={draft}
              placeholder={`Write as ${chat.personas?.name ?? "yourself"}…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim() && !busy) {
                    send.mutate(draft.trim());
                    setDraft("");
                  }
                }
              }}
              className="min-h-[3rem] resize-none"
            />
            <Button
              variant="secondary"
              size="icon"
              aria-label="Generate scene image"
              onClick={() => setScenePrompt(messages.at(-1)?.content.slice(0, 400) ?? "")}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              aria-label="Send message"
              disabled={busy || !draft.trim()}
              onClick={() => {
                send.mutate(draft.trim());
                setDraft("");
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </div>
      </div>

      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Story controls</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 p-4">
            <label className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-3"><span className="text-sm">Spicy mode<span className="block text-xs text-muted-foreground">Allows mature roleplay on the next reply.</span></span><Switch checked={chat.spicy} onCheckedChange={(next) => updateChat.mutate({ spicy: next })} /></label>
            {chat.personas ? (
              <div className="space-y-2">
                <Label>Edit active persona</Label>
                <Input id="active-persona-name" defaultValue={chat.personas.name} />
                <Textarea id="active-persona-description" rows={4} defaultValue={chat.personas.description} />
                <Button size="sm" variant="secondary" onClick={() => {
                  const name = (document.getElementById("active-persona-name") as HTMLInputElement | null)?.value ?? chat.personas?.name ?? "";
                  const description = (document.getElementById("active-persona-description") as HTMLTextAreaElement | null)?.value ?? chat.personas?.description ?? "";
                  if (chat.persona_id) updatePersona.mutate({ id: chat.persona_id, name, description });
                }}><UserRound className="h-4 w-4" />Save persona</Button>
              </div>
            ) : null}
            <div className="space-y-2"><Label>Chat background</Label>{user ? <ImageUploadButton userId={user.id} folder="backgrounds" onUploaded={(path) => updateChat.mutate({ background_path: path })} onError={(error) => toast.error(error.message)} /> : null}{chat.background_path ? <Button size="sm" variant="ghost" onClick={() => updateChat.mutate({ background_path: null })}>Remove background</Button> : null}</div>
            <div className="space-y-2">
              <Label>Reply length</Label>
              <Select
                value={settings.responseLength}
                onValueChange={(value) =>
                  updateSettings.mutate({
                    ...settings,
                    responseLength: value as ChatSettings["responseLength"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Narration style</Label>
              <Select
                value={settings.narration}
                onValueChange={(value) =>
                  updateSettings.mutate({
                    ...settings,
                    narration: value as ChatSettings["narration"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first-person">First person</SelectItem>
                  <SelectItem value="third-person">Third person</SelectItem>
                  <SelectItem value="script">Script</SelectItem>
                  <SelectItem value="novel">Novel prose</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Creative intensity — {settings.wildness}/10</Label>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[settings.wildness]}
                onValueChange={([value]) =>
                  updateSettings.mutate({ ...settings, wildness: value ?? settings.wildness })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="extra">Extra direction</Label>
              <Textarea
                id="extra"
                rows={4}
                defaultValue={settings.extraInstruction}
                placeholder="Anything goes here: tone, themes, pacing, hard rules."
                onBlur={(e) =>
                  updateSettings.mutate({ ...settings, extraInstruction: e.target.value })
                }
              />
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-3">
              <span className="text-sm">
                Auto story summary
                <span className="block text-xs text-muted-foreground">
                  Folds older scenes into memory so long stories stay consistent.
                </span>
              </span>
              <Switch
                checked={settings.autoSummary}
                onCheckedChange={(next) =>
                  updateSettings.mutate({ ...settings, autoSummary: next })
                }
              />
            </label>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showMemory} onOpenChange={setShowMemory}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Story memory</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Summary</Label>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={summarizeNow.isPending}
                  onClick={() => summarizeNow.mutate()}
                >
                  {summarizeNow.isPending ? "Writing…" : "Update now"}
                </Button>
              </div>
              <Textarea rows={9} value={summaryDraft} onChange={(event) => setSummaryDraft(event.target.value)} placeholder="No summary yet — it appears once the story gets going." />
              <Button size="sm" onClick={() => updateChat.mutate({ summary: summaryDraft })}>Save summary</Button>
              {summaryError ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3"><span>{summaryError}</span><Button size="sm" variant="secondary" onClick={() => summarizeNow.mutate()}>Retry</Button></AlertDescription></Alert> : null}
            </div>

            <div className="space-y-2">
              <Label>Pinned moments</Label>
              {pinned.length ? (
                <ul className="space-y-2">
                  {pinned.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-xl border border-primary/25 bg-card/60 p-3 text-sm"
                    >
                      {m.content}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pin a message and it stays true for the rest of the story.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Scene cards</Label>
              {imagesQuery.data?.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {imagesQuery.data.map((image) => (
                    <SceneCard key={image.id} path={image.path} prompt={image.prompt} onOpen={() => setSelectedScene(image)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No scene art yet.</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={scenePrompt !== null} onOpenChange={(next) => !next && setScenePrompt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate a scene card</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={scenePrompt ?? ""}
            onChange={(e) => setScenePrompt(e.target.value)}
            placeholder="Describe the moment you want to see."
          />
          {imageError ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3"><span>{imageError}</span><Button size="sm" variant="secondary" onClick={() => makeScene.mutate((scenePrompt ?? "").trim())}>Retry</Button></AlertDescription></Alert> : null}
          <DialogFooter>
            <Button
              disabled={makeScene.isPending || (scenePrompt ?? "").trim().length < 3}
              onClick={() => makeScene.mutate((scenePrompt ?? "").trim())}
            >
              {makeScene.isPending ? "Painting…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={selectedScene !== null} onOpenChange={(open) => !open && setSelectedScene(null)}>
        <DialogContent className="max-w-4xl p-3">
          {selectedScene ? <SceneViewer path={selectedScene.path} prompt={selectedScene.prompt} onBackground={() => updateChat.mutate({ background_path: selectedScene.path })} /> : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CharacterAvatar({
  path,
  name,
  small,
}: {
  path: string | null;
  name: string;
  small?: boolean;
}) {
  const url = useSignedUrl(path);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary/40",
        small ? "h-8 w-8" : "h-10 w-10",
      )}
    >
      {url ? (
        <img src={url} alt={`${name} portrait`} className="h-full w-full object-cover" />
      ) : (
        <Sparkle className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}

function SceneCard({ path, prompt, onOpen }: { path: string; prompt: string; onOpen: () => void }) {
  const url = useSignedUrl(path);
  return (
    <button type="button" onClick={onOpen} className="overflow-hidden rounded-xl border border-border bg-secondary/30 text-left">
      {url ? <img src={url} alt={prompt} className="h-28 w-full object-cover" /> : null}
      <span className="line-clamp-2 block p-2 text-xs text-muted-foreground">{prompt}</span>
    </button>
  );
}

function SceneViewer({ path, prompt, onBackground }: { path: string; prompt: string; onBackground: () => void }) {
  const url = useSignedUrl(path);
  return <div className="space-y-3">{url ? <img src={url} alt={prompt} className="max-h-[75vh] w-full rounded-xl object-contain" /> : null}<div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{prompt}</p><Button onClick={onBackground}>Set background</Button></div></div>;
}
