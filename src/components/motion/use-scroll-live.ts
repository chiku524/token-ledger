"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

export function useScrollLive() {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const reduce = useReducedMotion();
  return hydrated && !reduce;
}

export function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
