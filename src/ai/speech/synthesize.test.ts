import { describe, expect, it, vi } from "vitest";
import { prepareSpeechText, SpeechError, synthesizeSpeech, type SpeechTransport } from "./synthesize";

const CONFIG = { apiKey: "sk_test", voiceId: "voice_1", modelId: "model_1" };

function audioResponse(bytes = 4): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "audio/mpeg" } });
}

describe("prepareSpeechText", () => {
  it("collapses whitespace, trims, and caps length", () => {
    expect(prepareSpeechText("  hello   world  ")).toBe("hello world");
    expect(prepareSpeechText("x".repeat(5000))).toHaveLength(2000);
  });
});

describe("synthesizeSpeech", () => {
  it("is a no-op error when speech is not configured", async () => {
    await expect(synthesizeSpeech({ text: "hi" }, { config: null })).rejects.toBeInstanceOf(SpeechError);
  });

  it("rejects empty text", async () => {
    await expect(synthesizeSpeech({ text: "   " }, { config: CONFIG })).rejects.toThrow(/nothing to speak/i);
  });

  it("calls ElevenLabs with the key and voice and returns the audio bytes", async () => {
    const transport = vi.fn<SpeechTransport>(async () => audioResponse(8));
    const bytes = await synthesizeSpeech({ text: "hello" }, { config: CONFIG, transport });
    expect(bytes).toHaveLength(8);
    const [url, init] = transport.mock.calls[0];
    expect(url).toContain("/text-to-speech/voice_1");
    expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test");
    expect(JSON.parse(String(init?.body))).toMatchObject({ text: "hello", model_id: "model_1" });
  });

  it("uses a request voice override", async () => {
    const transport = vi.fn<SpeechTransport>(async () => audioResponse());
    await synthesizeSpeech({ text: "hi", voiceId: "other" }, { config: CONFIG, transport });
    expect(transport.mock.calls[0][0]).toContain("/text-to-speech/other");
  });

  it("surfaces the provider's error message and status", async () => {
    const transport: SpeechTransport = async () =>
      new Response(JSON.stringify({ detail: { message: "quota exceeded" } }), { status: 402, headers: { "content-type": "application/json" } });
    await expect(synthesizeSpeech({ text: "hi" }, { config: CONFIG, transport })).rejects.toMatchObject({
      message: expect.stringContaining("quota exceeded"),
      status: 402,
    });
  });
});
