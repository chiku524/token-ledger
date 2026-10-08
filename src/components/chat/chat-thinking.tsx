"use client";

import { Sparkles } from "lucide-react";

/**
 * The assistant "thinking" indicator, shown while a turn is in flight before
 * the first token arrives. Three dots pulse; the avatar sits beside it so the
 * pending turn reads as an assistant message in progress. Motion is opacity
 * only, so it stays calm under reduced motion.
 */
export function ChatThinking() {
  return (
    <div className="mb-4 flex items-start gap-2" role="status" aria-label="The assistant is thinking">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-3.5 animate-pulse" aria-hidden />
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${index * 200}ms`, animationDuration: "1.2s" }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
