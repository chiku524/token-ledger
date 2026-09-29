"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="max-w-xl border border-seal/40 bg-paper-raised p-5">
      <h1 className="font-serif text-3xl">These books could not be loaded</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{error.message || "Something went wrong while reading the books."}</p>
      <button type="button" className="btn mt-4" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
