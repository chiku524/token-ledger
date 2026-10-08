import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, DEFAULT_VOICE_ID, speechConfig, speechConfigured } from "./config";

describe("speechConfig", () => {
  it("is off when no key is set", () => {
    expect(speechConfig({})).toBeNull();
    expect(speechConfigured({})).toBe(false);
  });

  it("uses the premade default voice and model", () => {
    const config = speechConfig({ ELEVENLABS_API_KEY: "sk_test" });
    expect(config).toMatchObject({ apiKey: "sk_test", voiceId: DEFAULT_VOICE_ID, modelId: DEFAULT_MODEL_ID });
  });

  it("honours overrides", () => {
    const config = speechConfig({ ELEVENLABS_API_KEY: " k ", ELEVENLABS_VOICE_ID: "v1", ELEVENLABS_MODEL_ID: "m1" });
    expect(config).toMatchObject({ apiKey: "k", voiceId: "v1", modelId: "m1" });
  });

  it("reports configured when a key is present", () => {
    expect(speechConfigured({ ELEVENLABS_API_KEY: "sk_test" })).toBe(true);
  });
});
