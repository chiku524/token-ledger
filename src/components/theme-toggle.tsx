"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tl-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={toggle}
      aria-pressed={dark ?? undefined}
    >
      {dark === null ? "Theme" : dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
