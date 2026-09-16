import mark from "@/assets/thundr-mark.png";
import { cn } from "@/lib/utils";

export function ThundrMark({ className }: { className?: string }) {
  return (
    <img
      src={mark}
      alt="Thundr logo"
      width={816}
      height={816}
      loading="lazy"
      className={cn("h-8 w-8 object-contain drop-shadow-[0_0_10px_var(--neon-soft)]", className)}
    />
  );
}

export function ThundrWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ThundrMark className="h-7 w-7" />
      <span className="font-display text-xl font-bold tracking-[0.18em] uppercase glow-text">
        Thundr
      </span>
    </span>
  );
}
