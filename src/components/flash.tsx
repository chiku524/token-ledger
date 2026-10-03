"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";

export function Flash({ error, saved }: { error?: string; saved?: string }) {
  useEffect(() => {
    if (!saved) return;
    toast.success(saved, { id: saved });
    const url = new URL(window.location.href);
    if (url.searchParams.get("saved") === saved) {
      url.searchParams.delete("saved");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [saved]);

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        {error}
      </Alert>
    );
  }
  return null;
}
