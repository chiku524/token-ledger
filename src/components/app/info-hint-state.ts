/**
 * When the hint is open. It opens on a mouse hover, on keyboard focus and when
 * pressed or tapped, and closes when none of those holds or on Escape.
 */
export interface HintState {
  hover: boolean;
  focus: boolean;
  pinned: boolean;
}

export type HintEvent = "hover-in" | "hover-out" | "focus" | "blur" | "toggle" | "dismiss";

export const HINT_CLOSED: HintState = { hover: false, focus: false, pinned: false };

export function hintReducer(state: HintState, event: HintEvent): HintState {
  switch (event) {
    case "hover-in":
      return state.hover ? state : { ...state, hover: true };
    case "hover-out":
      return state.hover ? { ...state, hover: false } : state;
    case "focus":
      return state.focus ? state : { ...state, focus: true };
    case "blur":
      // Leaving the button also puts away a hint a tap left open.
      return state.focus || state.pinned ? { ...state, focus: false, pinned: false } : state;
    case "toggle":
      // A press while open for another reason closes it, so a tap always has an effect.
      return isHintOpen(state) ? HINT_CLOSED : { ...state, pinned: true };
    case "dismiss":
      return state === HINT_CLOSED || !isHintOpen(state) ? state : HINT_CLOSED;
  }
}

export function isHintOpen(state: HintState): boolean {
  return state.hover || state.focus || state.pinned;
}