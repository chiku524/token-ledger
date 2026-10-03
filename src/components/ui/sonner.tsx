"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function currentTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function Toaster(props: ToasterProps) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const)

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg !font-sans",
          success: "!border-success/30 [&_[data-icon]]:!text-success",
          error: "!border-danger/30 [&_[data-icon]]:!text-danger",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
