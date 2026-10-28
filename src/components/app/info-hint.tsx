"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useId, useReducer, useRef, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { HINT_CLOSED, hintReducer, isHintOpen } from "./info-hint-state";

/** How long the hint stays after the pointer leaves, so it can be reached and read. */
const HOVER_LEAVE_MS = 150;

/**
 * A small (i) button next to a section title. Its text opens in a popover on
 * hover, keyboard focus, or a press / tap, and Escape closes it. The same text
 * is always in the page (read by screen readers and tied to the button with
 * aria-describedby), so nothing is lost when the popover is closed.
 */
export function InfoHint({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  const [state, dispatch] = useReducer(hintReducer, HINT_CLOSED);
  const open = isHintOpen(state);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  }, []);
  useEffect(() => clearLeave, [clearLeave]);

  const hoverIn = () => {
    clearLeave();
    dispatch("hover-in");
  };
  const hoverOut = () => {
    clearLeave();
    leaveTimer.current = setTimeout(() => dispatch("hover-out"), HOVER_LEAVE_MS);
  };

  return (
    <div className={cn("inline-flex", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) dispatch("dismiss");
        }}
      >
        <PopoverAnchor asChild>
          <button
            ref={buttonRef}
            type="button"
            aria-label={`About ${title}`}
            aria-describedby={`${id}-text`}
            data-slot="info-hint"
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-9"
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") hoverIn();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") hoverOut();
            }}
            onFocus={(event) => {
              // Only for the keyboard: a mouse press or a tap is handled by the click.
              let keyboard = false;
              try {
                keyboard = event.currentTarget.matches(":focus-visible");
              } catch {
                keyboard = false;
              }
              if (keyboard) dispatch("focus");
            }}
            onBlur={() => dispatch("blur")}
            onClick={() => dispatch("toggle")}
            onKeyDown={(event) => {
              if (event.key === "Escape") dispatch("dismiss");
            }}
          >
            <Info className="size-4" aria-hidden />
          </button>
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="start"
          aria-hidden="true"
          // The words are already in the page for assistive tech; this is the visible copy.
          className="space-y-2 text-sm leading-relaxed"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          onInteractOutside={(event) => {
            // Pressing the button itself is a toggle, not an outside press.
            if (buttonRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
        >
          {children}
        </PopoverContent>
      </Popover>
      <div id={`${id}-text`} className="sr-only">
        {children}
      </div>
    </div>
  );
}