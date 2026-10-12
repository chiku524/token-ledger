"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCsrf, requireSession } from "@/auth/current";
import { safeNextPath } from "@/auth/csrf";
import { DEMO_DATA_COOKIE, cookieSecure, demoDataCookieOptions } from "@/auth/cookies";

/**
 * Turn the "Demo data" switch on or off. On, the dashboard shows the fictional
 * example books read-only; off, it returns to the signed-in organization's own
 * books. Signed-in users only; the form carries the CSRF token.
 *
 * It revalidates and then redirects back to the page it was on. The redirect is
 * what makes the switch take effect: setting a cookie inside an action does not
 * change the session the same response re-renders from, so the next request (the
 * redirect target) is the first one that reads the new cookie. Every other
 * cookie-setting action here pairs them the same way (see form-state `finish`).
 */
export async function setDemoDataAction(formData: FormData): Promise<void> {
  await requireSession();
  await assertCsrf(formData);
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const jar = await cookies();
  if (enabled) {
    jar.set(DEMO_DATA_COOKIE, "1", demoDataCookieOptions(cookieSecure()));
  } else {
    jar.delete(DEMO_DATA_COOKIE);
  }
  revalidatePath("/dashboard", "layout");
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}
