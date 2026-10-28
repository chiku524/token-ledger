import { describe, expect, it } from "vitest";
import { HINT_CLOSED, hintReducer, isHintOpen, type HintEvent, type HintState } from "./info-hint-state";

const run = (events: HintEvent[], from: HintState = HINT_CLOSED) => events.reduce(hintReducer, from);

describe("hintReducer", () => {
  it("starts closed", () => {
    expect(isHintOpen(HINT_CLOSED)).toBe(false);
  });

  it("opens on hover and closes when the pointer leaves", () => {
    expect(isHintOpen(run(["hover-in"]))).toBe(true);
    expect(isHintOpen(run(["hover-in", "hover-out"]))).toBe(false);
  });

  it("opens on keyboard focus and closes on blur", () => {
    expect(isHintOpen(run(["focus"]))).toBe(true);
    expect(isHintOpen(run(["focus", "blur"]))).toBe(false);
  });

  it("opens on a tap, closes on the next tap", () => {
    const open = run(["toggle"]);
    expect(isHintOpen(open)).toBe(true);
    expect(isHintOpen(hintReducer(open, "toggle"))).toBe(false);
  });

  it("closes a tapped hint when focus leaves", () => {
    expect(isHintOpen(run(["toggle", "blur"]))).toBe(false);
  });

  it("closes on Escape whatever opened it", () => {
    expect(isHintOpen(run(["hover-in", "focus", "toggle", "dismiss"]))).toBe(false);
  });

  it("closes with a press even when hover or focus opened it", () => {
    expect(isHintOpen(run(["hover-in", "toggle"]))).toBe(false);
    expect(isHintOpen(run(["focus", "toggle"]))).toBe(false);
  });
});