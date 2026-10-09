// Folding: which directories become nodes. Pure, over a file list.

export type FoldInput = { path: string; module: string };

/** A node on the folded map: a directory and every file it ended up holding. */
export type FoldedGroup = { dir: string; files: string[] };

export type Folding = { threshold: number; groups: FoldedGroup[] };

/** Roughly two dozen: past this a map stops being readable. */
export const MAX_GROUPS = 24;

// The lowest threshold, "fewer than a couple of files". Raised one at a time.
const FIRST_THRESHOLD = 2;

export function parentDir(dir: string): string | null {
  if (dir === ".") return null;
  const cut = dir.lastIndexOf("/");
  return cut === -1 ? "." : dir.slice(0, cut);
}

function depthOf(dir: string): number {
  return dir === "." ? 0 : dir.split("/").length;
}

/**
 * One fold at a fixed threshold. Every directory starts holding its own files.
 * Working from the deepest level up, a directory holding fewer than
 * `threshold` files hands them all to its parent. A directory left holding
 * nothing is not a node.
 */
export function foldAt(files: FoldInput[], threshold: number): FoldedGroup[] {
  const holdings = new Map<string, string[]>();
  for (const f of files) {
    for (let d: string | null = f.module; d !== null; d = parentDir(d)) {
      if (!holdings.has(d)) holdings.set(d, []);
    }
    holdings.get(f.module)?.push(f.path);
  }

  const byDepth = new Map<number, string[]>();
  for (const dir of holdings.keys()) {
    const depth = depthOf(dir);
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), dir]);
  }
  const deepest = Math.max(0, ...byDepth.keys());

  for (let depth = deepest; depth > 0; depth--) {
    const dirs = byDepth.get(depth) ?? [];
    // Every decision at a depth is taken before any merge at it is applied, so
    // no merge at one depth changes what a sibling at the same depth sees.
    const merging = dirs.filter((d) => {
      const n = holdings.get(d)?.length ?? 0;
      return n > 0 && n < threshold;
    });
    for (const dir of merging) {
      const parent = parentDir(dir);
      if (parent === null) continue;
      holdings.get(parent)?.push(...(holdings.get(dir) ?? []));
      holdings.set(dir, []);
    }
  }

  return [...holdings]
    .filter(([, held]) => held.length > 0)
    .map(([dir, held]) => ({ dir, files: [...held].sort() }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/**
 * The lowest threshold that lands at or under MAX_GROUPS. The repository's
 * own shape decides the depth; nothing is picked in advance. Always ends: past
 * the file count everything folds into the root.
 */
export function fold(files: FoldInput[]): Folding {
  for (let threshold = FIRST_THRESHOLD; ; threshold++) {
    const groups = foldAt(files, threshold);
    if (groups.length <= MAX_GROUPS || threshold > files.length) return { threshold, groups };
  }
}
