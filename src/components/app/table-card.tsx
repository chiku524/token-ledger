import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A bordered card that holds a `<Table>` edge to edge. */
export function TableCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn("mt-4 gap-0 py-0", className)}>{children}</Card>;
}
