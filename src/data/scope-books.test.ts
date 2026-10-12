import { describe, expect, it } from "vitest";
import { exampleBooks } from "./example-books";
import { entityName } from "./present";
import { scopeBooks } from "./scope-books";

const ENT = "ent_asset_manager_a";

describe("scopeBooks", () => {
  it("keeps the whole organization for owners and for an empty scope", () => {
    expect(scopeBooks(exampleBooks, { role: "owner", entityScope: [ENT] }).entities).toHaveLength(1);
    expect(scopeBooks(exampleBooks, { role: "viewer", entityScope: [] }).journalEntries).toHaveLength(
      exampleBooks.journalEntries.length,
    );
  });

  it("limits a viewer to the named company and leaves the audit log intact", () => {
    const scoped = scopeBooks(exampleBooks, { role: "viewer", entityScope: [ENT] });
    expect(scoped.entities.map((entity) => entity.id)).toEqual([ENT]);
    expect(scoped.journalEntries.every((entry) => entry.entityId === ENT)).toBe(true);
    expect(scoped.sources.every((source) => source.entityId === ENT)).toBe(true);
    expect(scoped.connections.every((connection) => connection.entityId === ENT)).toBe(true);
    expect(scoped.balanceSnapshots.every((snapshot) => snapshot.entityId === ENT)).toBe(true);
    expect(scoped.journalEntries).toHaveLength(exampleBooks.journalEntries.length);
    expect(scoped.auditEvents).toHaveLength(exampleBooks.auditEvents.length);
    expect(scoped.fxRates).toHaveLength(exampleBooks.fxRates.length);
    expect(entityName("ent_other", scoped.entities)).toBe("ent_other");
  });

  it("returns no companies for a scope that matches nothing", () => {
    const scoped = scopeBooks(exampleBooks, { role: "viewer", entityScope: ["ent_other"] });
    expect(scoped.entities).toHaveLength(0);
    expect(scoped.journalEntries).toHaveLength(0);
  });

  it("resolves the example company name", () => {
    expect(entityName(ENT, exampleBooks.entities)).toBe("Asset Manager A Pte. Ltd.");
  });
});
