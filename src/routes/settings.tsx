import { createFileRoute } from "@tanstack/react-router";

import { ApiKeyCard } from "@/components/ApiKeyCard";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Thundr" },
      {
        name: "description",
        content: "Manage your Thundr account settings and connect your own Gemini or OpenRouter API key.",
      },
      { property: "og:title", content: "Settings · Thundr" },
      {
        property: "og:description",
        content: "Choose the AI that powers your roleplay chats — the built-in AI or your own key.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Settings"
        subtitle="Choose which AI powers your chats, and manage your own API key."
      />
      <div className="max-w-xl space-y-6">
        <ApiKeyCard />
        <p className="text-xs text-muted-foreground">
          Your key is stored privately on your account and only ever used for your own chats. Clear
          the field and pick the built-in AI to stop using it.
        </p>
      </div>
    </AppShell>
  );
}
