"use client";

/**
 * The voice picker: any signed-in user chooses which voice reads replies aloud.
 * A preference (localStorage), not a permission — unlike the model switcher,
 * which is owner/admin only.
 */
import { useEffect, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ASSISTANT_VOICES } from "@/ai/speech/voices";

export interface VoicePickerProps {
  voiceId: string;
  onSelect: (id: string) => void;
}

export function VoicePicker({ voiceId, onSelect }: VoicePickerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active = ASSISTANT_VOICES.find((voice) => voice.id === voiceId) ?? ASSISTANT_VOICES[0];

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Voice: ${active.name}. Change voice`}
        onClick={() => setOpen((value) => !value)}
      >
        <Volume2 className="size-3.5" aria-hidden />
        <span className="max-w-[8rem] truncate">{active.name}</span>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
        >
          <p className="label-caps px-2 py-1.5 text-muted-foreground">Voice</p>
          {ASSISTANT_VOICES.map((voice) => {
            const selected = voice.id === voiceId;
            return (
              <button
                key={voice.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(voice.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  selected ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{voice.name}</span>
                  <span className="text-muted-foreground">{voice.description}</span>
                </span>
                {selected ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
