"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A shadcn Button that submits a Server Action and shows a spinner while the
 * action is pending, disabling itself until it resolves. On a slow Worker a
 * click otherwise looks like nothing happened. `useFormStatus` reads the nearest
 * enclosing `<form>`.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
  className,
  formAction,
  size,
}: {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} formAction={formAction} disabled={pending} aria-busy={pending} className={cn(className)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
