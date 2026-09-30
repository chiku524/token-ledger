export function ExampleBanner({ origin, notice }: { origin: "example" | "live"; notice: string }) {
  const label = origin === "live" ? "Live" : "Example";
  const tone = origin === "live" ? "bg-lime text-on-lime" : "bg-cobalt text-on-accent";
  return (
    <p className="border-b border-line bg-paper-raised px-4 py-2.5 text-sm text-ink-soft md:px-8" role="note">
      <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
      {notice}
    </p>
  );
}
