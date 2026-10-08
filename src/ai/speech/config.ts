/**
 * Config for assistant speech (text-to-speech). Server-only: the ElevenLabs API
 * key is read here and never sent to the browser. The browser asks our own
 * `/api/speech` route, which calls ElevenLabs on its behalf.
 *
 * Unset `ELEVENLABS_API_KEY` means speech is off; the Speak control is simply
 * not offered and the rest of the assistant is unaffected. See
 * docs/adr-ai-assistant.md.
 */
export interface SpeechConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

export interface SpeechEnv {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_MODEL_ID?: string;
}

/**
 * A premade voice that works on ElevenLabs' free tier. Library voices need a
 * paid plan when called through the API, so the default is a premade one.
 */
export const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // "Adam"
export const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

export function speechConfig(env: SpeechEnv = process.env as SpeechEnv): SpeechConfig | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    voiceId: env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    modelId: env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
  };
}

export function speechConfigured(env: SpeechEnv = process.env as SpeechEnv): boolean {
  return Boolean(env.ELEVENLABS_API_KEY?.trim());
}
