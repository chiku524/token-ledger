"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Alert variant="destructive" className="grid gap-3 p-5">
        <h1 className="text-2xl text-foreground font-semibold tracking-tight">This page could not be loaded</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {error.message || "Something went wrong while reading the books."}
        </p>
        {error.digest ? <p className="text-xs text-muted-foreground">Reference {error.digest}</p> : null}
        <div>
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </Alert>
    </main>
  );
}
