export const ROLES = ["owner", "admin", "accountant", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "books.read",
  "books.export",
  "audit.read",
  "entity.write",
  "source.write",
  "fx.write",
  "journal.post",
  "journal.reverse",
  "source.import",
  "users.manage",
  "users.manageOwners",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== "users.manageOwners"),
  accountant: ["books.read", "books.export", "audit.read", "journal.post", "journal.reverse", "source.import"],
  viewer: ["books.read", "books.export", "audit.read"],
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
  return "Viewer";
}
