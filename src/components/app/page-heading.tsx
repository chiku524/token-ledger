import type { ReactNode } from "react";
import { InfoHint } from "@/components/app/info-hint";
import { isLongDescription } from "@/components/app/info-hint-text";

/**
 * The title block at the top of a dashboard page. A short status line stays
 * under the title; a longer description moves into an info hint beside it.
 */
export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  const hinted = children ? isLongDescription(children) : false;
  return (
    <header className="mb-6">
      {hinted ? (
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <InfoHint title={title}>{children}</InfoHint>
        </div>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      )}
      {children && !hinted ? <p className="mt-1 text-sm text-muted-foreground">{children}</p> : null}
    </header>
  );
}