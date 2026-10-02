import { StatusBadge } from "@/components/app/status-badge";

export function ExampleBanner({ origin, notice }: { origin: "example" | "live"; notice: string }) {
  return (
    <p className="border-b border-border bg-card px-4 py-2.5 text-sm text-muted-foreground md:px-8" role="note">
      <StatusBadge tone={origin === "live" ? "live" : "example"} className="mr-2">
        {origin === "live" ? "Live" : "Example"}
      </StatusBadge>
      {notice}
    </p>
  );
}
