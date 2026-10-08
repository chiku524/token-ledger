/**
 * Per-organization assistant provider/model selection.
 *
 * An owner or admin can switch the organization between the providers this
 * deployment has keys for, and pick a model — without a redeploy. The choice is
 * stored on `organization_settings` and read by the chat route/actions, which
 * resolve the effective provider with `resolveAiConfig`. Only owner and admin
 * hold `ai.manage`. See docs/adr-ai-assistant.md.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizationSettings } from "@/db/schema";
import { aiConfig, type AiConfig, type AiEnv } from "./config";
import { PROVIDER_KEYS, providerFor } from "./registry";
import type { LlmProvider } from "./provider";
import type { ProviderKey, Transport } from "./types";

export interface OrgAiSelection {
  provider: string;
  model: string;
}

/** The stored override for an organization, or empty strings when none. */
export async function loadOrgAiSelection(organizationId: string): Promise<OrgAiSelection> {
  const db = getDb();
  const [row] = await db
    .select({ provider: organizationSettings.aiProvider, model: organizationSettings.aiModel })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  return { provider: row?.provider ?? "", model: row?.model ?? "" };
}

/** Replace the organization's provider/model selection. Empty clears the override. */
export async function saveOrgAiSelection(organizationId: string, selection: OrgAiSelection): Promise<void> {
  const db = getDb();
  await db
    .insert(organizationSettings)
    .values({
      organizationId,
      aiProvider: selection.provider,
      aiModel: selection.model,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { aiProvider: selection.provider, aiModel: selection.model, updatedAt: new Date() },
    });
}

/**
 * The base environment, then the organization's override on top. The override
 * only changes the provider and model; keys and base URLs still come from the
 * environment, so a selection can never introduce a secret or an endpoint.
 */
export function withSelection(base: AiEnv, selection: OrgAiSelection): AiEnv {
  return {
    ...base,
    AI_PROVIDER: selection.provider || base.AI_PROVIDER,
    AI_MODEL: selection.model || base.AI_MODEL,
  };
}

/** Resolve the effective AI config for an org, applying its override. */
export function resolveAiConfig(base: AiEnv, selection: OrgAiSelection): AiConfig | null {
  return aiConfig(withSelection(base, selection));
}

/**
 * Whether an override names a provider this deployment can actually reach. A
 * provider counts when its key is present (or it needs none). Used to present
 * only usable options and to reject a bad selection.
 */
export function providerUsable(provider: ProviderKey, env: AiEnv): boolean {
  try {
    const config = aiConfig({ ...env, AI_PROVIDER: provider, AI_MODEL: env.AI_MODEL });
    return config !== null;
  } catch {
    return false;
  }
}

/** The provider keys this deployment can serve, given the environment's keys. */
export function availableProviders(env: AiEnv): ProviderKey[] {
  return PROVIDER_KEYS.filter((key) => providerUsable(key, env));
}

/**
 * The provider to use for an organization, applying its stored override on top
 * of the deployment environment. Returns null when the assistant is off (no
 * provider configured at all). This is the one place the chat route and actions
 * obtain a provider, so a switch takes effect immediately.
 */
export async function providerForOrganization(
  organizationId: string,
  env: AiEnv = process.env as AiEnv,
  transport?: Transport,
): Promise<{ provider: LlmProvider; config: AiConfig; selection: OrgAiSelection } | null> {
  let selection: OrgAiSelection = { provider: "", model: "" };
  try {
    selection = await loadOrgAiSelection(organizationId);
  } catch {
    // No database or no settings row: fall back to the deployment default.
  }
  const config = resolveAiConfig(env, selection);
  if (!config) return null;
  return { provider: providerFor(config, transport), config, selection };
}
