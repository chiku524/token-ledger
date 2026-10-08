import { describe, expect, it } from "vitest";
import { ASSISTANT_VOICES, DEFAULT_VOICE, isAssistantVoice } from "./voices";

describe("assistant voices", () => {
  it("offers a catalog with a default included", () => {
    expect(ASSISTANT_VOICES.length).toBeGreaterThanOrEqual(4);
    expect(ASSISTANT_VOICES).toContain(DEFAULT_VOICE);
  });

  it("has unique ids per voice", () => {
    const ids = ASSISTANT_VOICES.map((voice) => voice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("recognises an offered id and rejects others", () => {
    expect(isAssistantVoice(DEFAULT_VOICE.id)).toBe(true);
    expect(isAssistantVoice("not-a-voice")).toBe(false);
    expect(isAssistantVoice(undefined)).toBe(false);
    expect(isAssistantVoice("")).toBe(false);
  });
});
