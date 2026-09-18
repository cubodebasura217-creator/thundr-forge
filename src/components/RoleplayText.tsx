import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|"[^"]+")/g;

export function RoleplayText({ children }: { children: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of children.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(children.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${index}-${token}`} className="font-bold text-primary">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={`${index}-${token}`} className="text-muted-foreground">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(<span key={`${index}-${token}`}>{token}</span>);
    }
    cursor = index + token.length;
  }
  if (cursor < children.length) nodes.push(children.slice(cursor));
  return <>{nodes}</>;
}