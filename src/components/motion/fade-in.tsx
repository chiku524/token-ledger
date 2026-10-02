import { cn } from "@/lib/utils";

export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Fade and rise on mount. Reduced-motion users get the fade only. See docs/design-system/motion.md. */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("rise-in", className)}
      style={{ "--rise-y": `${y}px`, animationDelay: delay ? `${delay}s` : undefined } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Wrap a route's content for the standard page fade. Mount it from a `template.tsx` so it replays on navigation. */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return <FadeIn className={className}>{children}</FadeIn>;
}
