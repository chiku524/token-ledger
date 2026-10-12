"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertCsrf, requireSession } from "@/auth/current";
import { DEMO_DATA_COOKIE, cookieSecure, demoDataCookieOptions } from "@/auth/cookies";

/**
 * Turn the "Demo data" switch on or off. On, the dashboard shows the fictional
 * example books read-only; off, it returns to the signed-in organization's own
 * books. Signed-in users only; the form carries the CSRF token.
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
}
