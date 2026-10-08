"use client";

/**
 * A `SpeechSynthesisAdapter` (assistant-ui) that speaks a reply through our
 * `/api/speech` route, which holds the ElevenLabs key server-side. The browser
 * only ever calls our own endpoint, so no API key reaches the client.
 *
 * Speech is best-effort: a failure ends the utterance with an error and does not
 * disturb the conversation.
 */
import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

type Utterance = SpeechSynthesisAdapter.Utterance;
type Status = SpeechSynthesisAdapter.Status;

export function createElevenLabsSpeechAdapter(options: { getVoiceId?: () => string | undefined } = {}): SpeechSynthesisAdapter {
  return {
    speak(text: string): Utterance {
      const controller = new AbortController();
      const audio = typeof Audio !== "undefined" ? new Audio() : null;

      let status: Status = { type: "starting" };
      const listeners = new Set<() => void>();
      const emit = () => {
        for (const listener of listeners) listener();
      };
      const finish = (next: Status) => {
        status = next;
        emit();
      };

      const run = async () => {
        try {
          const response = await fetch("/api/speech", {
            method: "POST",
            headers: { "content-type": "application/json" },
            // The picked voice, read at call time so a change applies without a remount.
            body: JSON.stringify({ text, voiceId: options.getVoiceId?.() }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as { error?: string } | null;
            finish({ type: "ended", reason: "error", error: detail?.error ?? `HTTP ${response.status}` });
            return;
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          if (!audio) {
            URL.revokeObjectURL(url);
            finish({ type: "ended", reason: "finished" });
            return;
          }
          audio.src = url;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            finish({ type: "ended", reason: "finished" });
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            finish({ type: "ended", reason: "error" });
          };
          status = { type: "running" };
          emit();
          await audio.play();
        } catch (error) {
          if (controller.signal.aborted) return;
          finish({ type: "ended", reason: "error", error: error instanceof Error ? error.message : String(error) });
        }
      };

      void run();

      return {
        get status() {
          return status;
        },
        cancel: () => {
          controller.abort();
          if (audio) {
            audio.pause();
            audio.src = "";
          }
          finish({ type: "ended", reason: "cancelled" });
        },
        subscribe: (callback: () => void) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      };
    },
  };
}
