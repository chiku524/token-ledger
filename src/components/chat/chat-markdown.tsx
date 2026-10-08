"use client";

/**
 * Renders assistant text as markdown. The model replies with headings, lists,
 * tables, and code; a plain `<p>` shows the raw `**`/`#`/`|` as literal text.
 *
 * This uses `@assistant-ui/react-markdown` (react-markdown under the hood) with
 * remark-gfm for tables and strikethrough, styled with our design tokens. It is
 * deliberately NOT `dangerouslySetInnerHTML`: model output is untrusted, and
 * react-markdown renders to React elements, so a hostile reply cannot inject
 * script. Links open in a new tab with `rel="noopener"`.
 */
import { memo } from "react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export const ChatMarkdown = memo(function ChatMarkdown() {
  return (
    <MarkdownTextPrimitive
      className="chat-markdown text-sm leading-relaxed"
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ className, ...props }) => <h3 className={cn("mt-3 mb-1.5 text-base font-semibold", className)} {...props} />,
        h2: ({ className, ...props }) => <h4 className={cn("mt-3 mb-1.5 text-sm font-semibold", className)} {...props} />,
        h3: ({ className, ...props }) => <h5 className={cn("mt-2.5 mb-1 text-sm font-semibold", className)} {...props} />,
        p: ({ className, ...props }) => <p className={cn("mb-2 last:mb-0", className)} {...props} />,
        ul: ({ className, ...props }) => <ul className={cn("mb-2 ml-4 list-disc space-y-0.5", className)} {...props} />,
        ol: ({ className, ...props }) => <ol className={cn("mb-2 ml-4 list-decimal space-y-0.5", className)} {...props} />,
        li: ({ className, ...props }) => <li className={cn("marker:text-muted-foreground", className)} {...props} />,
        a: ({ className, ...props }) => (
          <a className={cn("font-medium text-primary underline underline-offset-2", className)} target="_blank" rel="noopener noreferrer" {...props} />
        ),
        strong: ({ className, ...props }) => <strong className={cn("font-semibold text-foreground", className)} {...props} />,
        blockquote: ({ className, ...props }) => (
          <blockquote className={cn("mb-2 border-l-2 border-border pl-3 text-muted-foreground", className)} {...props} />
        ),
        hr: ({ className, ...props }) => <hr className={cn("my-3 border-border", className)} {...props} />,
        table: ({ className, ...props }) => (
          <div className="mb-2 overflow-x-auto rounded-lg border border-border">
            <table className={cn("w-full text-xs", className)} {...props} />
          </div>
        ),
        thead: ({ className, ...props }) => <thead className={cn("bg-muted/50 text-muted-foreground", className)} {...props} />,
        th: ({ className, ...props }) => <th className={cn("px-2 py-1 text-left font-medium", className)} {...props} />,
        td: ({ className, ...props }) => <td className={cn("border-t border-border px-2 py-1 align-top", className)} {...props} />,
        code: ({ className, ...props }) => (
          <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]", className)} {...props} />
        ),
        pre: ({ className, ...props }) => (
          <pre className={cn("mb-2 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs", className)} {...props} />
        ),
      }}
    />
  );
});
