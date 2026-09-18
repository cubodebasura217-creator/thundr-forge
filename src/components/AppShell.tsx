import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Compass, LogOut, MessagesSquare, Sparkle, UserRound, Globe2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { ThundrMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Chats", icon: MessagesSquare },
  { to: "/characters", label: "Characters", icon: Sparkle },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/worlds", label: "Worlds", icon: Globe2 },
  { to: "/personas", label: "Personas", icon: UserRound },
] as const;

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ThundrMark className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-backdrop">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Link to="/" className="shrink-0">
            <ThundrMark />
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-neon-soft text-primary glow-ring"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </Button>
        </div>
      </header>
      <main className={cn("mx-auto w-full px-4 py-8", wide ? "max-w-none px-0 py-0" : "max-w-7xl")}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
