/**
 * The voices a user can pick for the assistant's speech. Only **premade**
 * ElevenLabs voices are listed, because the API rejects library voices on a free
 * plan (HTTP 402). Each id here was verified to return audio on the free tier.
 *
 * A user's choice is a preference, not a permission: it is stored in the browser
 * (localStorage) and sent with each speech request, so every signed-in user can
 * pick their own without a role. The server still restricts the id to this
 * catalog, so a caller cannot select an arbitrary voice.
 */
export interface AssistantVoice {
  id: string;
  name: string;
  /** A short description of the tone, for the picker. */
  description: string;
}

export const ASSISTANT_VOICES: readonly AssistantVoice[] = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, narration" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Warm, well-rounded" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp, confident" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft, narration" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Intense, character" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Natural, conversational" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", description: "Casual, easy-going" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Steady, broadcast" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Calm, neutral" },
];

export const DEFAULT_VOICE = ASSISTANT_VOICES[0];

/** Whether an id is one of the offered voices. */
export function isAssistantVoice(id: string | undefined | null): boolean {
  return Boolean(id) && ASSISTANT_VOICES.some((voice) => voice.id === id);
}
