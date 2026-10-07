import { Save } from "lucide-react";
import { saveOnboardingTabsAction } from "@/app/dashboard/onboarding-actions";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { FormCard } from "@/components/app/form-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { loadOnboardingHiddenTabs } from "@/data/onboarding";
import { ALWAYS_VISIBLE, ONBOARDING_SECTIONS } from "@/data/onboarding-sections";
import { one } from "@/data/query";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session } = await loadAuthorizedBooks();
  if (!can(session.role, "onboarding.manage")) {
    return (
      <>
        <PageHeader
          kicker="Access"
          title="Onboarding"
          description="Owners and admins choose what a person with the onboarding role can see."
        />
        <EmptyState>You do not have permission to change onboarding access.</EmptyState>
      </>
    );
  }

  const writable = booksAreWritable() && !session.demo;
  const csrf = await ensureCsrf();
  const hidden = writable ? await loadOnboardingHiddenTabs(session.organizationId) : [];
  const hiddenSet = new Set(hidden);
  const alwaysVisible = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <>
      <PageHeader
        kicker="Access"
        title="Onboarding"
        description="Tick a section to hide it from the onboarding role. A hidden tab disappears from the sidebar and cannot be opened by its URL. Overview and Settings always stay, so an onboarding user has a home and an account page."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {!writable ? (
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This sample does not save. Connect a database to change onboarding access for a real organization.
        </p>
      ) : null}

      <FormCard action={saveOnboardingTabsAction} title="Hidden sections">
        <input type="hidden" name="csrf" value={csrf} />
        <fieldset className="md:col-span-2">
          <legend className="sr-only">Sections hidden from the onboarding role</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ONBOARDING_SECTIONS.map((section) => (
              <label
                key={section.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="hidden"
                  value={section.href}
                  defaultChecked={hiddenSet.has(section.href)}
                  className="size-4 accent-brand"
                />
                <span className="flex-1">{section.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{section.href}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="md:col-span-2">
          <SubmitButton pendingLabel="Saving…">
            <Save aria-hidden />
            Save onboarding tabs
          </SubmitButton>
        </div>
      </FormCard>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground">Always visible</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {alwaysVisible.map((item) => (
            <li key={item.href}>
              <StatusBadge tone="neutral">
                {item.label} · {item.href}
              </StatusBadge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          These cannot be hidden. {ALWAYS_VISIBLE.size} sections are fixed.
        </p>
      </section>
    </>
  );
}
