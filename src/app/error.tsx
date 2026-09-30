"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div role="alert" className="border border-seal/40 bg-paper-raised p-5">
        <h1 className="font-serif text-3xl">This page could not be loaded</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {error.message || "Something went wrong while reading the books."}
        </p>
        {error.digest ? <p className="mt-2 text-xs text-ink-soft">Reference {error.digest}</p> : null}
        <button type="button" className="btn mt-4" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
