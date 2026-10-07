import { StatusBadge } from "@/components/app/status-badge";

export function ExampleBanner({ origin, notice }: { origin: "example" | "live"; notice: string }) {
  return (
    <div className="border-b border-border bg-card" role="note">
      <p className="dashboard-width px-4 py-2.5 text-sm text-muted-foreground md:px-8">
        <StatusBadge tone={origin === "live" ? "live" : "example"} className="mr-2">
          {origin === "live" ? "Live" : "Example"}
        </StatusBadge>
        {notice}
      </p>
    </div>
  );
}
