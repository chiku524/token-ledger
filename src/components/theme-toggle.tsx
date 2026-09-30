"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tl-theme";

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function darkSnapshot(): boolean | null {
  return document.documentElement.classList.contains("dark");
}

function serverSnapshot(): boolean | null {
  return null;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, darkSnapshot, serverSnapshot);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft hover:text-ink"
      onClick={toggle}
      aria-pressed={dark ?? undefined}
    >
      {dark === null ? "Theme" : dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
