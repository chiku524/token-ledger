import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pathFor, REQUEST_PATH_HEADER } from "@/data/me-paths";
import type { OrganizationAccountType } from "@/data/account-type";

/**
 * Keep each kind of account in its own area. An individual lives under `/me`
 * and an organization under `/dashboard`; the same page serves both, so a link,
 * a bookmark or a sign-in `next` for the other area still arrives and is sent
 * on to the same page at the right address, query and all.
 *
 * Reads the address the proxy recorded. With no recorded address (a unit test,
 * or a call outside a request) there is nothing to correct.
 */
export async function keepInOwnArea(accountType: OrganizationAccountType | undefined): Promise<void> {
  const requested = (await headers()).get(REQUEST_PATH_HEADER);
  if (!requested) return;
  const home = pathFor(accountType, requested);
  if (home !== requested) redirect(home);
}
