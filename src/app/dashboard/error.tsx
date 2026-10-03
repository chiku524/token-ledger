"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert variant="destructive" className="grid max-w-xl gap-3 p-5">
      <h1 className="text-2xl text-foreground font-semibold tracking-tight">These books could not be loaded</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {error.message || "Something went wrong while reading the books."}
      </p>
      <div>
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </Alert>
  );
}
