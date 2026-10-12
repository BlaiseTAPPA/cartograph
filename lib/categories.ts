import { FRAMEWORKS, roleIn, type Framework, type Role } from "@/frameworks/taxonomy";
import type { RepoFile } from "@/parser/types";

/** null is unclassified: no convention identified the file. */
export type RoleCount = { role: Role | null; files: number };

/**
 * Parsed files per role, read off the role stored with each file. Skipped
 * files aren't on the map, so they aren't counted here. Every role the
 * framework names is listed, zeros included, in its fixed order, so each sits
 * in the same place whatever the repository.
 */
export function countByRole(files: readonly RepoFile[], framework: Framework): RoleCount[] {
  const counts = new Map<Role | null, number>();
  for (const f of files) {
    if (f.status !== "parsed") continue;
    const role = f.role === null ? null : roleIn(framework, f.role);
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const order: readonly (Role | null)[] = [...FRAMEWORKS[framework], null];
  return order.map((role) => ({ role, files: counts.get(role) ?? 0 }));
}
