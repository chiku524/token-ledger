"use server";

/**
 * Assistant provider/model settings, for an owner or admin (`ai.manage`).
 *
 * An admin switches the organization between the providers this deployment has
 * keys for and picks a model, without a redeploy. The selection is stored per
 * organization and read by the chat route/actions. These are called from the
 * chat panel's model selector, so they return values rather than redirecting.
 */
import { actorName, assertCsrf, requireSession } from "@/auth/current";
import { can, type Permission } from "@/auth/roles";
import { availableProviders, loadOrgAiSelection, providerUsable, saveOrgAiSelection } from "@/ai/settings";
import { modelsFor, type CatalogModel } from "@/ai/models";
import { DEFAULT_MODEL, type AiEnv } from "@/ai/config";
import { listProviders } from "@/ai/registry";
import type { ProviderKey } from "@/ai/types";
import { hasDatabase } from "@/db/availability";

export interface AiOption {
  key: ProviderKey;
  name: string;
  models: CatalogModel[];
  defaultModel: string;
}

export interface AiSettings {
  /** The provider actually in effect (the org override, else the deployment default). */
  provider: string;
  model: string;
  /** True when the org has its own override; false means it follows the deployment. */
  customized: boolean;
  /** The providers an owner/admin may switch to (keys present). */
  options: AiOption[];
}

const MANAGE: Permission = "ai.manage";

/**
 * The current assistant selection and the switchable options. Read-only: any
 * signed-in session may view it so the panel can show the active model; only the
 * setter requires `ai.manage`.
 */
export async function getAiSettingsAction(): Promise<AiSettings> {
  const session = await requireSession();
  const env = process.env as AiEnv;
  const providerKeys = availableProviders(env);
  const options: AiOption[] = providerKeys.map((key) => ({
    key,
    name: listProviders().find((entry) => entry.key === key)?.name ?? key,
    models: modelsFor(key),
    defaultModel: DEFAULT_MODEL[key],
  }));

  let selection = { provider: "", model: "" };
  if (session.organizationId && hasDatabase()) {
    try {
      selection = await loadOrgAiSelection(session.organizationId);
    } catch {
      selection = { provider: "", model: "" };
    }
  }
  const provider = selection.provider || (env.AI_PROVIDER?.trim() ?? "");
  const model = selection.model || (env.AI_MODEL?.trim() ?? (provider ? DEFAULT_MODEL[provider as ProviderKey] : ""));
  return { provider, model, customized: Boolean(selection.provider || selection.model), options };
}

export interface SetAiSelectionResult {
  ok: boolean;
  error?: string;
}

/** Switch the organization's provider/model. Owner or admin only. */
export async function setAiSelectionAction(formData: FormData): Promise<SetAiSelectionResult> {
  await assertCsrf(formData);
  const session = await requireSession();
  if (!can(session.role, MANAGE)) return { ok: false, error: "Only an owner or admin can change the assistant model." };
  if (!hasDatabase()) return { ok: false, error: "Connect a database to save the selection." };

  const provider = String(formData.get("provider") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  if (!provider) return { ok: false, error: "Choose a provider." };
  if (!providerUsable(provider as ProviderKey, process.env as AiEnv)) {
    return { ok: false, error: `${provider} has no key configured on this deployment.` };
  }
  // An empty model means "use the provider's default".
  await saveOrgAiSelection(session.organizationId, { provider, model });
  return { ok: true };
}

/** Clear the organization's override, returning to the deployment default. */
export async function resetAiSelectionAction(formData: FormData): Promise<SetAiSelectionResult> {
  await assertCsrf(formData);
  const session = await requireSession();
  if (!can(session.role, MANAGE)) return { ok: false, error: "Only an owner or admin can change the assistant model." };
  if (!hasDatabase()) return { ok: false, error: "Connect a database to save the selection." };
  await saveOrgAiSelection(session.organizationId, { provider: "", model: "" });
  void actorName(session);
  return { ok: true };
}
