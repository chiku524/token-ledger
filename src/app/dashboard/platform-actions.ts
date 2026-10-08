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
import { setPlatformUserStatus } from "@/db/platform";
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

async function applyStatus(formData: FormData, status: "active" | "inactive"): Promise<void> {
  await assertCsrf(formData);
  const session = await requirePlatformAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect(`${PATH}?error=${encodeURIComponent("Choose a user.")}`);

  // A platform admin cannot lock themselves out.
  if (userId === session.id) redirect(`${PATH}?error=${encodeURIComponent("You cannot change your own status here.")}`);

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
