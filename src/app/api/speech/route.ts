/**
 * Text-to-speech route. The browser asks this for audio; it calls ElevenLabs
 * server-side, so `ELEVENLABS_API_KEY` never reaches the client. Requires a
 * signed-in session (speech is part of the assistant, not a public endpoint).
 *
 * Returns audio/mpeg on success, or a small JSON error the client can show.
 */
import { getSession } from "@/auth/current";
import { speechConfigured } from "@/ai/speech/config";
import { prepareSpeechText, SpeechError, synthesizeSpeech } from "@/ai/speech/synthesize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to use speech." }, { status: 401 });
  if (!speechConfigured()) return Response.json({ error: "Speech is not configured." }, { status: 503 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Text is too large." }, { status: 413 });

  let body: { text?: string; voiceId?: string; modelId?: string };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const text = prepareSpeechText(String(body.text ?? ""));
  if (!text) return Response.json({ error: "Nothing to speak." }, { status: 400 });

  try {
    const audio = await synthesizeSpeech({ text, voiceId: body.voiceId, modelId: body.modelId });
    return new Response(new Uint8Array(audio), {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof SpeechError ? (error.status ?? 502) : 502;
    const message = error instanceof SpeechError ? error.message : "Speech failed.";
    return Response.json({ error: message }, { status });
  }
}
