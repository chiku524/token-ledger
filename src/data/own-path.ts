import { getSession } from "@/auth/current";
import { pathFor } from "./me-paths";

/**
 * A page address in the signed-in account's own area: `/me/...` for an individual, `/dashboard/...`
 * otherwise. For a server action that must choose where to return before it has the session in hand.
 */
export async function ownPath(href: string): Promise<string> {
  return pathFor((await getSession())?.accountType, href);
}
