"use client";

/**
 * The assistant model selector. Visible only to an owner or admin (`ai.manage`):
 * they pick the provider (Cloudflare, OpenRouter, …) and a model, and it is
 * stored per organization and applied on the next turn. See AI-14 / #289.
 */
import { useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAiSettingsAction,
  setAiSelectionAction,
  resetAiSelectionAction,
  type AiSettings,
} from "@/app/dashboard/ai-actions";

export interface ModelSelectorProps {
  csrf: string;
}

export function ModelSelector({ csrf }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load once on mount, so the trigger (which shows the active model) can render.
  useEffect(() => {
    if (settings) return;
    void (async () => {
      try {
        setSettings(await getAiSettingsAction());
      } catch {
        setError("Could not load the model list.");
      }
    })();
  }, [settings]);

  async function choose(provider: string, model: string) {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("csrf", csrf);
    form.set("provider", provider);
    form.set("model", model);
    const result = await setAiSelectionAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save.");
      return;
    }
    const next = await getAiSettingsAction();
    setSettings(next);
  }

  async function reset() {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("csrf", csrf);
    const result = await resetAiSelectionAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Could not reset.");
      return;
    }
    setSettings(await getAiSettingsAction());
  }

  // The trigger always renders, even before the settings resolve: it is the only
  // way in, so it must not depend on its own click to appear.
  const active = settings?.options.find((option) => option.key === settings.provider);
  const label = settings?.model || active?.name || "Model";

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bot className="size-3.5" aria-hidden />
        <span className="max-w-[10rem] truncate">{label}</span>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
        >
          <p className="label-caps px-2 py-1.5 text-muted-foreground">Assistant model · owner &amp; admin</p>
          {!settings ? (
            <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : null}
          {settings?.options.map((option) => (
            <div key={option.key} className="mb-1">
              <p className="px-2 py-1 text-xs font-medium text-foreground">{option.name}</p>
              {option.models.map((model) => {
                const selected = settings.provider === option.key && (settings.model || option.defaultModel) === model.id;
                return (
                  <button
                    key={`${option.key}:${model.id}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={pending}
                    onClick={() => void choose(option.key, model.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50",
                      selected ? "bg-muted text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate">{model.label}</span>
                      {model.free ? (
                        <span className="rounded-full bg-[color:var(--chart-2)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--chart-2)]">
                          free
                        </span>
                      ) : null}
                    </span>
                    {selected ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {settings?.customized ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void reset()}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Reset to the deployment default
            </button>
          ) : null}
          {pending ? (
            <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Saving…
            </p>
          ) : null}
          {error ? <p role="alert" className="px-2 py-1.5 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
