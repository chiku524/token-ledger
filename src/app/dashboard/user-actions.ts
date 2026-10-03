"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorName, assertCsrf, AuthError, requirePermission, requireSession, type SessionUser } from "@/auth/current";
import { absoluteLink, deliver } from "@/email/links";
import { inviteEmail, verifyEmail } from "@/email/messages";
import { canAssignRole, canDeactivate, isRole, removesLastOwner } from "@/auth/roles";
import { canWriteBooks } from "@/data/authorized-books";
import { loadBooks } from "@/data/load-books";
import { firstIssue, userFormSchema } from "@/data/validate";
import {
  activeOwnerIds,
  createEmailVerification,
  createInvite,
  deactivateUser,
  deleteUserSessions,
  findUserByEmail,
  insertUser,
  listOrganizationUsers,
  setUserAccess,
  writeAudit,
} from "@/db/auth-store";
import { fail, finish, safeMessage } from "./form-state";

const PATH = "/dashboard/users";
const READ_ONLY = "Connect a database to add people. This demo does not save them.";

export async function inviteUserAction(formData: FormData) {
  const session = await guard("users.manage", formData);
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);
  const parsed = userFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    entityScope: formData.get("entityScope") ?? "",
  });
  if (!parsed.success) fail(PATH, firstIssue(parsed.error));
  if (!canAssignRole(session, parsed.data.role, null)) fail(PATH, "You cannot assign that role.");
  const books = await loadBooks(session.organizationId);
  const unknown = parsed.data.entityScope.find((id) => !books.entities.some((entity) => entity.id === id));
  if (unknown) fail(PATH, `Unknown company ${unknown}.`);
  const existing = await findUserByEmail(parsed.data.email);
  if (existing && existing.organizationId === session.organizationId) {
    fail(PATH, "That email is already in this organization.");
  }
  const booksForName = books;
  let token = "";
  let userId = "";
  try {
    userId = await insertUser({
      organizationId: session.organizationId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      entityScope: parsed.data.entityScope,
      passwordHash: null,
      status: "invited",
    });
    token = await createInvite({
      organizationId: session.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      entityScope: parsed.data.entityScope,
      createdBy: session.id,
    });
  } catch (error) {
    fail(PATH, safeMessage(error));
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto");
  const link = absoluteLink(`/sign-in?invite=${token}`, host, proto);
  const delivery = link
    ? await deliver(
        inviteEmail({
          to: parsed.data.email,
          link,
          organizationName: booksForName.organization.name,
          inviterName: session.name,
          expiresInDays: 7,
        }),
      )
    : { sent: false, reason: "No base URL was configured." };

  await writeAudit({
    organizationId: session.organizationId,
    actor: actorName(session),
    action: delivery.sent ? "user.invited" : "user.invite_created",
    subjectType: "user",
    subjectId: userId,
    detail: delivery.sent
      ? `Invited ${parsed.data.email} as ${parsed.data.role}; invite emailed.`
      : `Invited ${parsed.data.email} as ${parsed.data.role}; email not sent (${delivery.reason}).`,
  });
  revalidatePath("/dashboard", "layout");
  redirect(`${PATH}?issued=${encodeURIComponent(token)}${delivery.sent ? "&emailed=1" : ""}`);
}

export async function changeAccessAction(formData: FormData) {
  const session = await guard("users.manage", formData);
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isRole(role)) fail(PATH, "Choose a role.");
  const entityScope = String(formData.get("entityScope") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const books = await loadBooks(session.organizationId);
  const unknown = entityScope.find((id) => !books.entities.some((entity) => entity.id === id));
  if (unknown) fail(PATH, `Unknown company ${unknown}.`);
  const users = await listOrganizationUsers(session.organizationId);
  const target = users.find((user) => user.id === userId);
  if (!target || target.status === "inactive") fail(PATH, "That user is not active in this organization.");
  if (!canAssignRole(session, role, target)) fail(PATH, "You cannot change that user's role.");
  const owners = await activeOwnerIds(session.organizationId);
  if (removesLastOwner(owners, target.id, role)) fail(PATH, "The organization needs at least one active owner.");
  try {
    await setUserAccess(target.id, role, entityScope);
    if (target.id !== session.id) await deleteUserSessions(target.id);
    await writeAudit({
      organizationId: session.organizationId,
      actor: actorName(session),
      action: "user.role_changed",
      subjectType: "user",
      subjectId: target.id,
      detail: `${target.email} is now ${role}.`,
    });
  } catch (error) {
    fail(PATH, safeMessage(error));
  }
  revalidatePath("/dashboard", "layout");
  redirect(`${PATH}?saved=${encodeURIComponent(`Updated ${target.email}.`)}`);
}

export async function deactivateUserAction(formData: FormData) {
  const session = await guard("users.manage", formData);
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);
  const userId = String(formData.get("userId") ?? "");
  const users = await listOrganizationUsers(session.organizationId);
  const target = users.find((user) => user.id === userId);
  if (!target || target.status === "inactive") fail(PATH, "That user is not active in this organization.");
  if (!canDeactivate(session, target)) fail(PATH, "You cannot deactivate that user.");
  const owners = await activeOwnerIds(session.organizationId);
  if (removesLastOwner(owners, target.id, "inactive")) fail(PATH, "The organization needs at least one active owner.");
  try {
    await deactivateUser(target.id);
    await writeAudit({
      organizationId: session.organizationId,
      actor: actorName(session),
      action: "user.deactivated",
      subjectType: "user",
      subjectId: target.id,
      detail: `Deactivated ${target.email}.`,
    });
  } catch (error) {
    fail(PATH, safeMessage(error));
  }
  revalidatePath("/dashboard", "layout");
  redirect(`${PATH}?saved=${encodeURIComponent(`Deactivated ${target.email}.`)}`);
}

/**
 * Resend the signed-in user's own email-confirmation link. Any signed-in user
 * may trigger their own verification, so this needs no permission beyond a
 * session; it sends to the account's own address only.
 */
export async function resendVerificationAction(formData: FormData): Promise<void> {
  const path = "/dashboard/settings";
  try {
    await assertCsrf(formData);
  } catch (error) {
    fail(path, error instanceof AuthError ? error.message : "The form expired. Refresh and try again.");
  }
  const session = await requireSession();
  if (session.demo) fail(path, "This sample is read-only. Verify a real account after connecting a database.");

  const books = await loadBooks(session.organizationId);
  const token = await createEmailVerification(session.id, session.organizationId);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto");
  const link = absoluteLink(`/verify-email?token=${token}`, host, proto);
  if (!link) fail(path, "Could not build a confirmation link. Set APP_URL.");
  const delivery = await deliver(verifyEmail({ to: session.email, link, organizationName: books.organization.name }));
  await writeAudit({
    organizationId: session.organizationId,
    actor: actorName(session),
    action: "user.verification_resent",
    subjectType: "user",
    subjectId: session.id,
    detail: delivery.sent ? "Confirmation email resent." : `Confirmation email not sent (${delivery.reason}).`,
  });
  if (!delivery.sent) fail(path, delivery.reason ?? "The confirmation email could not be sent.");
  finish(path, `Confirmation email sent to ${session.email}.`);
}

async function guard(permission: "users.manage", formData: FormData): Promise<SessionUser> {
  try {
    await assertCsrf(formData);
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthError) fail(PATH, error.message);
    throw error;
  }
}
