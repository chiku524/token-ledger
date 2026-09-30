import { describe, expect, it } from "vitest";
import { exampleBooks } from "./example-books";
import { entityName } from "./present";
import { scopeBooks } from "./scope-books";

describe("scopeBooks", () => {
  it("keeps the whole organization for owners and for an empty scope", () => {
    expect(scopeBooks(exampleBooks, { role: "owner", entityScope: ["ent_harbourline_sg"] }).entities).toHaveLength(2);
    expect(scopeBooks(exampleBooks, { role: "viewer", entityScope: [] }).journalEntries).toHaveLength(exampleBooks.journalEntries.length);
  });

  it("limits a viewer to the named entities and leaves the audit log intact", () => {
    const scoped = scopeBooks(exampleBooks, { role: "viewer", entityScope: ["ent_harbourline_sg"] });
    expect(scoped.entities.map((entity) => entity.id)).toEqual(["ent_harbourline_sg"]);
    expect(scoped.journalEntries.every((entry) => entry.entityId === "ent_harbourline_sg")).toBe(true);
    expect(scoped.sources.every((source) => source.entityId === "ent_harbourline_sg")).toBe(true);
    expect(scoped.connections.every((connection) => connection.entityId === "ent_harbourline_sg")).toBe(true);
    expect(scoped.balanceSnapshots.every((snapshot) => snapshot.entityId === "ent_harbourline_sg")).toBe(true);
    expect(scoped.auditEvents).toHaveLength(exampleBooks.auditEvents.length);
    expect(scoped.fxRates).toHaveLength(exampleBooks.fxRates.length);
    expect(entityName("ent_harbourline_my", scoped.entities)).toBe("ent_harbourline_my");
    expect(entityName("ent_harbourline_sg", scoped.entities)).toBe("Harbourline Digital Pte. Ltd.");
  });
});
