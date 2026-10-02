import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("py-6", className)}>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}
