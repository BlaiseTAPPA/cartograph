import { FILE_CATEGORIES, type FileCategory, type FrameworkAdapter } from "@/parser/adapter";
import type { RepoFile } from "@/parser/types";

/** null is unclassified: no convention identified the file. */
export type CategoryCount = { category: FileCategory | null; files: number };

/**
 * Parsed files per category. Skipped files aren't on the map, so they aren't
 * counted here. Every category is listed, zeros included, in a fixed order so
 * each sits in the same place whatever the repository.
 */
export function countByCategory(files: RepoFile[], adapter: FrameworkAdapter): CategoryCount[] {
  const counts = new Map<FileCategory | null, number>();
  for (const f of files) {
    if (f.status !== "parsed") continue;
    const category = adapter.categorize(f.path);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...FILE_CATEGORIES, null].map((category) => ({
    category,
    files: counts.get(category) ?? 0,
  }));
}
