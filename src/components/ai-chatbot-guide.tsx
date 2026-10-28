"use client";

import { useState } from "react";
import { m } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Presence } from "@/components/motion/presence";
import { TableCard } from "@/components/app/table-card";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reopenConnectionTourAction } from "@/app/dashboard/tour-actions";
import { cn } from "@/lib/utils";
import { isIndividualAccount } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import {
  capabilityGroupsFor,
  examplePromptsFor,
  firstRunStepsFor,
  guideSectionsFor,
  refusalsFor,
  tourPathFor,
  type GuideSectionId,
} from "@/data/ai-chatbot-guide";

const EASE = [0.22, 1, 0.36, 1] as const;

function FlowDiagram({ steps }: { steps: readonly { emoji: string; title: string }[] }) {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-2" aria-label="Flow">
      {steps.map((step, index) => (
        <li key={step.title} className="flex items-center gap-2">
          <m.div
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
          >
            <span aria-hidden className="text-base leading-none">
              {step.emoji}
            </span>
            <span className="text-sm font-medium">{step.title}</span>
          </m.div>
          {index < steps.length - 1 ? (
            <m.span
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(index, 7) * 0.04 + 0.08 }}
            >
              <ArrowRight className="size-4 text-muted-foreground" />
            </m.span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function DoctrinePanel({ individual }: { individual: boolean }) {
  return (
    <div className="grid gap-6">
      <FlowDiagram
        steps={[
          { emoji: "📡", title: "Read source" },
          { emoji: "👀", title: "Observe" },
          { emoji: "✍️", title: individual ? "Review" : "Deliberate post" },
          { emoji: "📊", title: "Report" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            icon: Sparkles,
            title: "Same product, spoken",
            body: individual ? "The assistant drives the dashboard you already have — it does not invent a second set of numbers." : "The assistant drives the dashboard you already have — it does not invent a second ledger.",
          },
          {
            icon: ShieldAlert,
            title: "Session stays the boss",
            body: individual
              ? "Your role applies to every tool call. No privilege escalation."
              : "Role, entity scope, and Approvals apply to every tool call. No privilege escalation.",
          },
        ].map(({ icon: Icon, title, body }, index) => (
          <m.div
            key={title}
            className="rounded-xl border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.12 + index * 0.04, ease: EASE }}
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </m.div>
        ))}
      </div>
      <ul className="grid gap-2 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">👀 {individual ? "Observations stay observed." : "Observations ≠ journals."}</span> {individual ? "A Check only reads." : "A Check never posts."}
        </li>
        <li>
          <span className="font-medium text-foreground">🔒 Sources are read-only.</span> No exchange or custodian spending.
        </li>
        <li>
          <span className="font-medium text-foreground">✍️ {individual ? "Your numbers come from your accounts." : "Posts are deliberate."}</span> {individual ? "The assistant reads what your wallets and exchanges report; it cannot change it." : "Matching, close, and revaluation stay intentional."}
        </li>
      </ul>
    </div>
  );
}

function FirstRunPanel({ accountType }: { accountType?: OrganizationAccountType }) {
  const steps = firstRunStepsFor(accountType);
  return (
    <div className="grid gap-6">
      <FlowDiagram steps={steps.map(({ emoji, title }) => ({ emoji, title }))} />
      <ol className="grid gap-3">
        {steps.map((step, index) => (
          <m.li
            key={step.title}
            className="rounded-xl border border-border bg-card px-4 py-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
          >
            <p className="font-medium">
              <span aria-hidden className="mr-2">
                {step.emoji}
              </span>
              {step.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
          </m.li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        Common pitfall: connecting Coinbase and expecting coins without pressing <span className="font-medium text-foreground">Check</span>, then looking on{" "}
        <span className="font-medium text-foreground">Holdings → Observed balances</span>.
      </p>
    </div>
  );
}

function CapabilitiesPanel({ accountType }: { accountType?: OrganizationAccountType }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {capabilityGroupsFor(accountType).map((group, index) => (
        <m.div
          key={group.title}
          className="rounded-xl border border-border bg-card p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
        >
          <p className="font-medium">
            <span aria-hidden className="mr-2">
              {group.emoji}
            </span>
            {group.title}
          </p>
          <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
            {group.items.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </m.div>
      ))}
    </div>
  );
}

function PromptsPanel({ accountType }: { accountType?: OrganizationAccountType }) {
  return (
    <ul className="grid gap-3">
      {examplePromptsFor(accountType).map((prompt, index) => (
        <m.li
          key={prompt.text}
          className="rounded-xl border border-border bg-card px-4 py-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
        >
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{prompt.tone}</p>
          <p className="mt-1 text-sm font-medium">“{prompt.text}”</p>
        </m.li>
      ))}
    </ul>
  );
}

function RefusalsPanel({ accountType }: { accountType?: OrganizationAccountType }) {
  return (
    <ul className="grid gap-3">
      {refusalsFor(accountType).map((item, index) => (
        <m.li
          key={item.title}
          className="rounded-xl border border-border bg-card px-4 py-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
        >
          <p className="font-medium">
            <span aria-hidden className="mr-2">
              {item.emoji}
            </span>
            {item.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
        </m.li>
      ))}
    </ul>
  );
}

function ConnectionsPanel({ individual }: { individual: boolean }) {
  return (
    <div className="grid gap-8">
      <FlowDiagram
        steps={[
          { emoji: "🏢", title: individual ? "Your account" : "Company" },
          { emoji: "🔌", title: "Connection" },
          { emoji: "👛", title: "Account" },
          { emoji: "👀", title: "Observation" },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Watch-only wallet",
            stores: "A public address and the network",
            secret: "No key. Chain data is public.",
          },
          {
            title: "Exchange, read-only",
            stores: "Account id + sealed read-only API key when needed",
            secret: "Trading and withdrawal stay off.",
          },
          {
            title: "Custodian, read-only",
            stores: "Vault id + sealed viewer credential",
            secret: "Cannot sign or move funds.",
          },
        ].map((mode, index) => (
          <m.div
            key={mode.title}
            className="rounded-xl border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.04, ease: EASE }}
          >
            <p className="font-medium">{mode.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">{mode.stores}</p>
            <p className="mt-2 text-sm text-muted-foreground">{mode.secret}</p>
          </m.div>
        ))}
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Meaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Waiting", "Added, and not successfully checked yet. A failed first check stays here."],
              ["Up to date", "The last Check returned balances and movements."],
              ["Needs attention", "A check failed after an earlier success."],
              ["Disconnected", "An admin stopped future reads. History remains."],
            ].map(([status, meaning]) => (
              <TableRow key={status}>
                <TableCell className="font-medium">{status}</TableCell>
                <TableCell className="text-muted-foreground">{meaning}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function SectionBody({ id, accountType }: { id: GuideSectionId; accountType?: OrganizationAccountType }) {
  switch (id) {
    case "doctrine":
      return <DoctrinePanel individual={isIndividualAccount(accountType)} />;
    case "first-run":
      return <FirstRunPanel accountType={accountType} />;
    case "capabilities":
      return <CapabilitiesPanel accountType={accountType} />;
    case "prompts":
      return <PromptsPanel accountType={accountType} />;
    case "refusals":
      return <RefusalsPanel accountType={accountType} />;
    case "connections":
      return <ConnectionsPanel individual={isIndividualAccount(accountType)} />;
  }
}

export function AiChatbotGuide({
  csrf,
  canRestartTour,
  accountType,
}: {
  csrf: string;
  canRestartTour: boolean;
  /** An individual's guide leaves out the pages and features an individual does not have. */
  accountType?: OrganizationAccountType;
}) {
  const [active, setActive] = useState<GuideSectionId>("doctrine");
  const sections = guideSectionsFor(accountType);
  const section = sections.find((item) => item.id === active)!;

  return (
    <div className="grid max-w-5xl gap-8">
      <nav aria-label="Guide sections" className="relative flex flex-wrap gap-1 border-b border-border pb-1">
        {sections.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={cn(
                "relative rounded-lg px-3 py-2 text-sm transition-colors",
                selected ? "font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={selected ? "true" : undefined}
            >
              {selected ? (
                <m.span
                  layoutId="guide-toc-pill"
                  className="absolute inset-0 rounded-lg bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
              <span className="relative">
                <span aria-hidden className="mr-1.5">
                  {item.emoji}
                </span>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <Presence mode="wait">
        <m.section
          key={active}
          aria-labelledby={`guide-${active}-heading`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="grid gap-4"
        >
          <div>
            <h2 id={`guide-${active}-heading`} className="text-lg font-semibold tracking-tight">
              <span aria-hidden className="mr-2">
                {section.emoji}
              </span>
              {section.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{section.blurb}</p>
          </div>
          <SectionBody id={active} accountType={accountType} />
        </m.section>
      </Presence>

      {canRestartTour ? (
        <form action={reopenConnectionTourAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <SubmitButton>Restart getting-started tour</SubmitButton>
          <p className="text-sm text-muted-foreground">
            Opens the coach again for {tourPathFor(accountType)}.
          </p>
        </form>
      ) : null}
    </div>
  );
}
