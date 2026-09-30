import { ENTITY_CHART } from "@/data/chart-template";
import { READ_ONLY_SCOPES, type ConnectionDraft } from "@/data/connections";
import { assignSignupEntity } from "@/data/signup";
import { STARTER_ASSETS } from "@/data/starter-assets";
import { getDb } from "./client";
import { accounts, assets, auditEvents, connections, entities, organizations, sources, users } from "./schema";
import { BooksWriteError } from "./write";

export async function registerOrganization(input: {
  ownerName: string;
  email: string;
  passwordHash: string;
  organizationName: string;
  entityName: string;
  jurisdiction: string;
  functionalCurrency: string;
  reportingFramework: string;
  connections: ConnectionDraft[];
}): Promise<{ userId: string; organizationId: string }> {
  const organizationId = newId("org");
  const entityId = newId("ent");
  const userId = newId("user");
  const actor = `${input.ownerName} <${input.email.toLowerCase()}>`;
  const drafts = assignSignupEntity(input.connections, entityId);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: organizationId,
      name: input.organizationName,
      origin: "live",
    });
    await tx.insert(entities).values({
      id: entityId,
      organizationId,
      name: input.entityName,
      jurisdiction: input.jurisdiction,
      functionalCurrency: input.functionalCurrency,
      reportingFramework: input.reportingFramework,
      parentEntityId: null,
    });
    await tx.insert(accounts).values(
      ENTITY_CHART.map((account) => ({
        ...account,
        id: newId("acct"),
        organizationId,
        entityId,
      })),
    );
    await tx.insert(assets).values(
      STARTER_ASSETS.map((asset) => ({
        id: newId("asset"),
        organizationId,
        code: asset.code,
        name: asset.name,
        chain: asset.chain,
        decimals: asset.decimals,
        assetClass: asset.assetClass,
      })),
    );
    await tx.insert(users).values({
      id: userId,
      organizationId,
      email: input.email.toLowerCase(),
      name: input.ownerName,
      passwordHash: input.passwordHash,
      role: "owner",
      status: "active",
      entityScope: "",
      connectionTourCompletedAt: null,
    });

    const audits = [
      auditRow(organizationId, actor, "entity.created", "entity", entityId, input.entityName),
      auditRow(organizationId, actor, "user.signed_up", "user", userId, "Account created from signup."),
    ];

    for (const draft of drafts) {
      if (draft.connection.scopes !== READ_ONLY_SCOPES) {
        throw new BooksWriteError("A connection can only read balances and movements.");
      }
      const connectionId = newId("conn");
      const sourceId = newId("src");
      await tx.insert(connections).values({
        id: connectionId,
        organizationId,
        entityId,
        mode: draft.connection.mode,
        venue: draft.connection.venue,
        name: draft.connection.name,
        status: "pending",
        scopes: READ_ONLY_SCOPES,
        cursor: null,
        lastSyncedAt: null,
        lastError: null,
      });
      await tx.insert(sources).values({
        id: sourceId,
        organizationId,
        connectionId,
        entityId,
        kind: draft.source.kind,
        role: draft.source.role,
        name: draft.source.name,
        chain: draft.source.chain,
        identifier: draft.source.identifier,
      });
      audits.push(
        auditRow(organizationId, actor, "connection.created", "connection", connectionId, `${draft.connection.name} · read-only`),
      );
    }

    await tx.insert(auditEvents).values(audits);
  });

  return { userId, organizationId };
}

function auditRow(organizationId: string, actor: string, action: string, subjectType: string, subjectId: string, detail: string) {
  return {
    id: newId("audit"),
    organizationId,
    occurredAt: new Date(),
    actor,
    action,
    subjectType,
    subjectId,
    detail,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
