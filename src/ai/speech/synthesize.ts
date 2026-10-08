import { speechConfig, type SpeechConfig, type SpeechEnv } from "./config";

/**
 * Text-to-speech through ElevenLabs. Server-only: it holds the API key and is
 * called from our own `/api/speech` route, so the key never reaches the browser.
 * A read-only capability in the assistant's sense — speaking a reply changes
 * nothing.
 */
export type SpeechTransport = (input: string, init?: RequestInit) => Promise<Response>;

export interface SynthesizeInput {
  text: string;
  voiceId?: string;
  modelId?: string;
  signal?: AbortSignal;
}

const MAX_TEXT_LENGTH = 2000;

/** Trim and cap the text so an oversized reply cannot run up the bill. */
export function prepareSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

export class SpeechError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SpeechError";
    this.status = status;
  }
}

/** Synthesize speech and return MP3 bytes. Throws SpeechError on failure. */
export async function synthesizeSpeech(
  input: SynthesizeInput,
  options: { config?: SpeechConfig | null; env?: SpeechEnv; transport?: SpeechTransport } = {},
): Promise<Uint8Array> {
  const config = options.config ?? speechConfig(options.env);
  if (!config) throw new SpeechError("Speech is not configured.", 503);
  const text = prepareSpeechText(input.text);
  if (!text) throw new SpeechError("Nothing to speak.", 400);

  const voiceId = input.voiceId?.trim() || config.voiceId;
  const modelId = input.modelId?.trim() || config.modelId;
  const transport: SpeechTransport = options.transport ?? ((url, init) => globalThis.fetch(url, init));

  const response = await transport(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": config.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: modelId }),
      signal: input.signal,
    },
  );

  if (!response.ok) {
    // The provider's own message is safe to show; the key is never echoed.
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: { message?: string } | string };
      const message = typeof body.detail === "string" ? body.detail : body.detail?.message;
      if (message) detail = message;
    } catch {
      // Keep the status line.
    }
    throw new SpeechError(`Speech: ${detail}`, response.status);
  }

  return new Uint8Array(await response.arrayBuffer());
}
