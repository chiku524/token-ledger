/** Prefer a live organization, then the newest example organization. */
export function pickOrganization<T extends { origin: "example" | "live"; createdAt: Date }>(
  organizations: readonly T[],
): T | null {
  const ranked = organizations.slice().sort((a, b) => {
    if (a.origin !== b.origin) return a.origin === "live" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return ranked[0] ?? null;
}
