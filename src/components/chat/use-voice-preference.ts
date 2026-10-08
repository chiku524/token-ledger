"use client";

/**
 * The user's chosen assistant voice, persisted in the browser so it survives a
 * reload and applies to every reply they play. It is a preference, not a
 * permission: no role is needed, and it is sent with each speech request. The
 * server still restricts the id to the offered catalog.
 */
import { useCallback, useSyncExternalStore } from "react";
import { ASSISTANT_VOICES, DEFAULT_VOICE } from "@/ai/speech/voices";

const STORAGE_KEY = "tl_voice_id";
const EVENT = "tl-voice-change";

function isOffered(id: string | null): id is string {
  return Boolean(id) && ASSISTANT_VOICES.some((voice) => voice.id === id);
}

// A tiny external store over localStorage, so the value is read on the client
// without a setState-in-effect and updates notify every subscriber.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isOffered(stored) ? stored : DEFAULT_VOICE.id;
  } catch {
    return DEFAULT_VOICE.id;
  }
}

/** The server has no localStorage; render the default and reconcile on hydrate. */
function getServerSnapshot(): string {
  return DEFAULT_VOICE.id;
}

export function useVoicePreference(): { voiceId: string; setVoiceId: (id: string) => void } {
  const voiceId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setVoiceId = useCallback((id: string) => {
    if (!isOffered(id)) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // A storage failure just means the choice is not remembered.
    }
    for (const listener of listeners) listener();
  }, []);

  return { voiceId, setVoiceId };
}
