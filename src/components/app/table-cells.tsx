import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Align = "left" | "right";

export function NumberHead({ className, ...props }: React.ComponentProps<typeof TableHead>) {
  return <TableHead className={cn("text-right", className)} {...props} />;
}

export function NumberCell({
  align = "right",
  className,
  ...props
}: React.ComponentProps<typeof TableCell> & { align?: Align }) {
  return (
    <TableCell
      className={cn("font-mono whitespace-nowrap tabular-nums", align === "right" ? "text-right" : "text-left", className)}
      {...props}
    />
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground whitespace-normal">
        {children}
      </TableCell>
    </TableRow>
  );
}
