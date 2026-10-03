import { Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  children,
  action,
  icon: Icon = Inbox,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card className={cn("py-6", className)}>
      <CardContent className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </CardContent>
    </Card>
  );
}
