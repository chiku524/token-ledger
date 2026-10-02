import { Alert } from "@/components/ui/alert";

export function Flash({ error, saved }: { error?: string; saved?: string }) {
  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        {error}
      </Alert>
    );
  }
  if (saved) {
    return (
      <Alert variant="success" role="status" className="mb-6">
        {saved}
      </Alert>
    );
  }
  return null;
}
