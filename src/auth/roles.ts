export const ROLES = ["owner", "admin", "accountant", "approver", "viewer", "onboarding"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "books.read",
  "books.export",
  "audit.read",
  "entity.write",
  "source.write",
  "source.connect",
  "fx.write",
  "journal.post",
  "journal.reverse",
  "journal.prepare",
  "journal.approve",
  "reconciliation.match",
  "period.close",
  "source.import",
  "users.manage",
  "users.manageOwners",
  "onboarding.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * An approver may read and approve a prepared entry, but cannot post directly or
 * reverse: approval is the only way it changes the books. A preparer (accountant)
 * prepares and posts drafts but cannot approve them.
 *
 * `source.connect` (add a wallet by signing, which proves ownership of the
 * address) is held by every role, so any user can bring their own wallet in.
 * `source.write` (add an arbitrary address without signing, or an exchange or
 * custodian) stays with owner and admin.
 *
 * `onboarding` is a read-only role for a new person looking around: it can read
 * and export the books and connect a wallet, but cannot write. Its tabs are
 * narrowed further by the organization's hidden-tab selection (see
 * `onboarding.manage`), so an operator can hide whole sections while the person
 * gets oriented.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== "users.manageOwners"),
  accountant: [
    "books.read",
    "books.export",
    "audit.read",
    "journal.post",
    "journal.reverse",
    "journal.prepare",
    "reconciliation.match",
    "source.import",
    "source.connect",
  ],
  approver: ["books.read", "books.export", "audit.read", "journal.prepare", "journal.approve", "source.connect"],
  viewer: ["books.read", "books.export", "audit.read", "source.connect"],
  onboarding: ["books.read", "books.export", "audit.read", "source.connect"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export interface Actor {
  id: string;
  role: Role;
  entityScope: readonly string[];
}

/** Empty scope means every entity. Owner and admin are not narrowed by scope. */
export function canAccessEntity(actor: Actor, entityId: string): boolean {
  if (actor.role === "owner" || actor.role === "admin") return true;
  if (actor.entityScope.length === 0) return true;
  return actor.entityScope.includes(entityId);
}

export function canAssignRole(actor: Actor, nextRole: Role, target: { role: Role; id: string } | null): boolean {
  if (!can(actor.role, "users.manage")) return false;
  if (target?.id === actor.id && nextRole !== actor.role) return false;
  if (nextRole === "owner" || target?.role === "owner") return can(actor.role, "users.manageOwners");
  return true;
}

export function canDeactivate(actor: Actor, target: { role: Role; id: string }): boolean {
  if (target.id === actor.id) return false;
  if (!can(actor.role, "users.manage")) return false;
  if (target.role === "owner") return can(actor.role, "users.manageOwners");
  return true;
}

export function removesLastOwner(activeOwnerIds: readonly string[], targetId: string, nextRole: Role | "inactive"): boolean {
  if (!activeOwnerIds.includes(targetId)) return false;
  if (nextRole === "owner") return false;
  return activeOwnerIds.filter((id) => id !== targetId).length === 0;
}

export function roleLabel(role: Role): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "accountant") return "Accountant";
  if (role === "approver") return "Approver";
  if (role === "onboarding") return "Onboarding";
  return "Viewer";
}

/**
 * A person should not approve the entry they prepared, unless an owner overrides
 * with an explicit note. Returns true when the approval must be refused.
 */
export function blocksSelfApproval(preparerActor: string, approverActor: string, overrideNote: string | null): boolean {
  if (preparerActor !== approverActor) return false;
  return !overrideNote || overrideNote.trim().length === 0;
}
