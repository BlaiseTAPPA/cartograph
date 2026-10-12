import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ignoresDirectory } from "./conventions.ts";

export type PackageManifest = {
  /** Folder holding the package.json, relative to the root; "" for the root. */
  dir: string;
  dependencies: Set<string>;
};

/**
 * Every package.json the walk would reach, with every dependency it declares
 * of any kind: a component library lists react only as a peer. A manifest
 * that isn't valid JSON declares nothing, rather than being guessed at.
 */
export function findPackages(root: string): PackageManifest[] {
  const found: PackageManifest[] = [];
  const visit = (dirAbs: string, dirRel: string) => {
    const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!ignoresDirectory(entry.name)) visit(path.join(dirAbs, entry.name), rel);
      } else if (entry.isFile() && entry.name === "package.json") {
        found.push({ dir: dirRel, dependencies: declaredDependencies(path.join(dirAbs, entry.name)) });
      }
    }
  };
  visit(root, "");
  return found;
}

function declaredDependencies(file: string): Set<string> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return new Set();
  }
  const names = new Set<string>();
  if (typeof manifest !== "object" || manifest === null) return names;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps: unknown = Reflect.get(manifest, field);
    if (typeof deps === "object" && deps !== null) for (const name of Object.keys(deps)) names.add(name);
  }
  return names;
}

/**
 * The deepest of `dirs` that contains `file`, or null. A file belongs to the
 * nearest app around it, so a nested app's conventions win inside it.
 */
export function nearestDir(dirs: readonly string[], file: string): string | null {
  let best: string | null = null;
  for (const dir of dirs) {
    const inside = dir === "" || file.startsWith(`${dir}/`);
    if (inside && (best === null || dir.length > best.length)) best = dir;
  }
  return best;
}

/** `rel` with the folder taken off the front. */
export function withinDir(dir: string, rel: string): string {
  return dir === "" ? rel : rel.slice(dir.length + 1);
}

/** Joins repository-relative path parts, skipping the empty root. */
export function joinRel(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}
