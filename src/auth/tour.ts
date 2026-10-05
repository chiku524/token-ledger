import type { Role } from "./roles";
import { canTakeConnectionTour } from "@/data/getting-started";

export function shouldShowConnectionTour(input: {
  role: Role;
  completedAt: string | null;
  dismissedInBrowser: boolean;
}): boolean {
  if (!canTakeConnectionTour(input.role)) return false;
  if (input.dismissedInBrowser) return false;
  return input.completedAt === null;
}
