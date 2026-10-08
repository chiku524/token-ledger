"use server";

/**
 * Platform-admin actions: cross-organization user administration. Only an email
 * on `PLATFORM_ADMIN_EMAILS` reaches these (see `requirePlatformAdmin`). Every
 * change is audited in the affected user's organization.
 */
import { actorName, assertCsrf, requirePlatformAdmin } from "@/auth/current";
import { writeAudit } from "@/db/auth-store";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { setPlatformUserAdmin, setPlatformUserStatus } from "@/db/platform";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

const PATH = "/dashboard/platform";

/** Deactivate a user in any organization. Platform admins only. */
export async function deactivatePlatformUserAction(formData: FormData): Promise<void> {
  await applyStatus(formData, "inactive");
}

/** Reactivate a user in any organization. Platform admins only. */
export async function reactivatePlatformUserAction(formData: FormData): Promise<void> {
  await applyStatus(formData, "active");
}

/** Grant the platform-admin role to a user. Platform admins only. */
export async function grantPlatformAdminAction(formData: FormData): Promise<void> {
  await applyPlatformAdmin(formData, true);
}

/** Revoke the platform-admin role. Platform admins only; not your own. */
export async function revokePlatformAdminAction(formData: FormData): Promise<void> {
  await applyPlatformAdmin(formData, false);
}

async function applyPlatformAdmin(formData: FormData, platformAdmin: boolean): Promise<void> {
  await assertCsrf(formData);
  const session = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect(`${PATH}?error=${encodeURIComponent("Choose a user.")}`);

  // A platform admin cannot revoke their own access.
  if (userId === session.id && !platformAdmin) {
    redirect(`${PATH}?error=${encodeURIComponent("You cannot revoke your own platform access.")}`);
  }

  const target = await findUser(userId);
  if (!target) redirect(`${PATH}?error=${encodeURIComponent("That user no longer exists.")}`);

  await setPlatformUserAdmin(userId, platformAdmin);
  await writeAudit({
    organizationId: target.organizationId,
    actor: `${actorName(session)} (platform)`,
    action: platformAdmin ? "platform.admin_granted" : "platform.admin_revoked",
    subjectType: "user",
    subjectId: userId,
    detail: `${target.email} ${platformAdmin ? "granted" : "removed from"} the platform-admin role.`,
  });
  redirect(`${PATH}?saved=${encodeURIComponent(platformAdmin ? "Platform access granted." : "Platform access revoked.")}`);
}

async function applyStatus(formData: FormData, status: "active" | "inactive"): Promise<void> {
  await assertCsrf(formData);
  const session = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect(`${PATH}?error=${encodeURIComponent("Choose a user.")}`);

  // A platform admin cannot lock themselves out.
  if (userId === session.id) redirect(`${PATH}?error=${encodeURIComponent("You cannot change your own status here.")}`);

  const target = await findUser(userId);
  if (!target) redirect(`${PATH}?error=${encodeURIComponent("That user no longer exists.")}`);

  await setPlatformUserStatus(userId, status);
  await writeAudit({
    organizationId: target.organizationId,
    actor: `${actorName(session)} (platform)`,
    action: status === "active" ? "platform.user_reactivated" : "platform.user_deactivated",
    subjectType: "user",
    subjectId: userId,
    detail: `${target.email} set to ${status} by a platform admin.`,
  });
  redirect(`${PATH}?saved=${encodeURIComponent(status === "active" ? "User reactivated." : "User deactivated.")}`);
}

async function findUser(userId: string): Promise<{ organizationId: string; email: string } | null> {
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return target ? { organizationId: target.organizationId, email: target.email } : null;
}
