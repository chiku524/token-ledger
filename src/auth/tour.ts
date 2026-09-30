import type { Role } from "./roles";

export function shouldShowConnectionTour(input: {
  role: Role;
  completedAt: string | null;
  dismissedInBrowser: boolean;
}): boolean {
  if (input.role !== "admin") return false;
  if (input.dismissedInBrowser) return false;
  return input.completedAt === null;
}
