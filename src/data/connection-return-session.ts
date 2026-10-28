import { getSession } from "@/auth/current";
import { connectionReturnPath } from "./connection-return";

/** `connectionReturnPath` for the signed-in account type, so an individual never returns to a section it does not have. */
export async function connectionReturnPathForSession(value: unknown): Promise<string> {
  return connectionReturnPath(value, (await getSession())?.accountType);
}
