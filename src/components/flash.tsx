export function Flash({ error, saved }: { error?: string; saved?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-6 border border-seal/40 bg-paper-raised px-4 py-3 text-sm text-seal">
        {error}
      </p>
    );
  }
  if (saved) {
    return (
      <p role="status" className="mb-6 border border-pine/40 bg-paper-raised px-4 py-3 text-sm text-pine">
        {saved}
      </p>
    );
  }
  return null;
}
