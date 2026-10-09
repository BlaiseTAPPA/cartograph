import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { FrameworkAdapter } from "./adapter.ts";

export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

// Above this a file is almost always generated or bundled; reading its imports
// would add nothing a person wrote. It is still listed, as skipped.
export const MAX_FILE_BYTES = 1024 * 1024;

export type WalkedFile = {
  /** Relative to root, forward slashes. */
  path: string;
  absolute: string;
  bytes: number;
};

export type Walk = {
  files: WalkedFile[];
  ignoredDirectories: string[];
};

export function isSourcePath(p: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

export function isDeclarationPath(p: string): boolean {
  return /\.d\.[cm]?ts$/.test(p) || /\.d\.[^/]+\.ts$/.test(p);
}

/** The folder a file belongs to: its parent directory, "." at the root. */
export function moduleOf(relativePath: string): string {
  return path.posix.dirname(relativePath);
}

/**
 * Keeps whole directories: every source file under the root except in
 * directories the adapter ignores. Selection never depends on file size or
 * count, so an import can't point at a file that was dropped to save room.
 */
export function walkRepository(root: string, adapter: FrameworkAdapter): Walk {
  const files: WalkedFile[] = [];
  const ignoredDirectories: string[] = [];

  const visit = (dirAbs: string, dirRel: string) => {
    const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const abs = path.join(dirAbs, entry.name);
      // Symlinks are not followed: they can loop, and a linked directory is
      // either outside the repository or already walked at its real path.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (adapter.ignoresDirectory(entry.name, rel)) {
          ignoredDirectories.push(rel);
          continue;
        }
        visit(abs, rel);
      } else if (entry.isFile() && isSourcePath(entry.name)) {
        files.push({ path: rel, absolute: abs, bytes: statSync(abs).size });
      }
    }
  };

  visit(root, "");
  return { files, ignoredDirectories };
}
