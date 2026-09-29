export function ExampleBanner({ origin, notice }: { origin: "example" | "live"; notice: string }) {
  const label = origin === "live" ? "Live" : "Example";
  return (
    <p className="border-b border-line bg-paper-raised px-4 py-2 text-sm text-ink-soft md:px-8" role="note">
      <span className={`mr-2 font-medium uppercase tracking-[0.14em] ${origin === "live" ? "text-pine" : "text-seal"}`}>{label}</span>
      {notice}
    </p>
  );
}
