"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorName, assertCsrf, requireSession } from "@/auth/current";
import { CONNECTION_TOUR_COOKIE, cookieSecure, sessionCookieOptions } from "@/auth/cookies";
import { completeConnectionTour, reopenConnectionTour, writeAudit } from "@/db/auth-store";

export async function completeConnectionTourAction(formData: FormData): Promise<void> {
  await assertCsrf(formData);
  const session = await requireSession();
  if (session.role !== "admin") return;
  if (session.demo) {
    const jar = await cookies();
    jar.set(CONNECTION_TOUR_COOKIE, "1", { ...sessionCookieOptions(cookieSecure()), maxAge: 60 * 60 * 24 * 365 });
  } else if (session.connectionTourCompletedAt === null) {
    await completeConnectionTour(session.id);
    await writeAudit({
      organizationId: session.organizationId,
      actor: actorName(session),
      action: "connection.tour_completed",
      subjectType: "user",
      subjectId: session.id,
      detail: "Finished the connection tour.",
    });
  }
  revalidatePath("/dashboard", "layout");
}

export async function reopenConnectionTourAction(formData: FormData): Promise<void> {
  await assertCsrf(formData);
  const session = await requireSession();
  if (session.role !== "admin") return;
  if (session.demo) {
    const jar = await cookies();
    jar.delete(CONNECTION_TOUR_COOKIE);
  } else {
    await reopenConnectionTour(session.id);
    await writeAudit({
      organizationId: session.organizationId,
      actor: actorName(session),
      action: "connection.tour_reopened",
      subjectType: "user",
      subjectId: session.id,
      detail: "Opened the connection tour again.",
    });
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/sources");
}
