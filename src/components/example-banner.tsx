import { EXAMPLE_NOTICE } from "@/data/example-books";

export function ExampleBanner() {
  return (
    <p className="border-b border-line bg-paper-raised px-4 py-2 text-sm text-ink-soft md:px-8" role="note">
      <span className="mr-2 font-medium uppercase tracking-[0.14em] text-seal">Example</span>
      {EXAMPLE_NOTICE}
    </p>
  );
}
