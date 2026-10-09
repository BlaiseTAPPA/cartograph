import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fallbackAdapter, type FrameworkAdapter } from "./adapter.ts";
import { dedupeEdges, fanCounts } from "./graph.ts";
import { findImports, type FoundImport } from "./imports.ts";
import { Resolver, type KnownFile } from "./resolve.ts";
import {
  RESULT_VERSION,
  type Coverage,
  type Edge,
  type ImportRecord,
  type ParseResult,
  type RepoFile,
  type SkipReason,
} from "./types.ts";
import { isDeclarationPath, MAX_FILE_BYTES, moduleOf, walkRepository } from "./walk.ts";

export type * from "./types.ts";
export { fallbackAdapter, type FrameworkAdapter } from "./adapter.ts";

/** Path in, data out. Reads the directory and nothing else. */
export function parseRepository(
  directory: string,
  adapter: FrameworkAdapter = fallbackAdapter,
): ParseResult {
  // The real path, so a resolved file can be compared against the root
  // whatever symlinks or casing the caller used.
  const root = realpathSync.native(path.resolve(directory));
  const walk = walkRepository(root, adapter);

  // Decide every file's fate before resolving anything: an import can only be
  // an edge if its target is a file that was parsed.
  type Pending =
    | { status: "parsed"; path: string; text: string; bytes: Buffer }
    | { status: "skipped"; path: string; reason: SkipReason };
  const pending: Pending[] = walk.files.map((file) => {
    if (isDeclarationPath(file.path)) {
      return { status: "skipped", path: file.path, reason: "declaration-file" };
    }
    if (file.bytes > MAX_FILE_BYTES) {
      return { status: "skipped", path: file.path, reason: "too-large" };
    }
    try {
      const bytes = readFileSync(file.absolute);
      return { status: "parsed", path: file.path, text: bytes.toString("utf8"), bytes };
    } catch {
      return { status: "skipped", path: file.path, reason: "unreadable" };
    }
  });

  const known = new Map<string, KnownFile>(
    pending.map((f) => [
      f.path,
      f.status === "parsed" ? { status: "parsed" } : { status: "skipped", reason: f.reason },
    ]),
  );
  const resolver = new Resolver(root, known, walk.ignoredDirectories);

  const imports: ImportRecord[] = [];
  const rawEdges: Edge[] = [];
  for (const file of pending) {
    if (file.status !== "parsed") continue;
    const found: FoundImport[] = findImports(path.join(root, file.path), file.text);
    for (const imp of found) {
      const outcome = resolver.resolve(imp, file.path);
      imports.push({
        from: file.path,
        specifier: imp.specifier ?? imp.text,
        kind: imp.kind,
        line: imp.line,
        outcome,
      });
      if (outcome.status === "resolved") {
        rawEdges.push({ from: file.path, to: outcome.target, kind: imp.kind });
      }
    }
  }

  const edges = dedupeEdges(rawEdges);
  const fan = fanCounts(
    pending.filter((f) => f.status === "parsed").map((f) => f.path),
    edges,
  );

  const files: RepoFile[] = pending.map((f) => {
    const folder = moduleOf(f.path);
    if (f.status === "skipped") {
      return { status: "skipped", path: f.path, module: folder, reason: f.reason };
    }
    const counts = fan.get(f.path) ?? { fanIn: 0, fanOut: 0 };
    return {
      status: "parsed",
      path: f.path,
      module: folder,
      lines: countLines(f.text),
      hash: createHash("sha256").update(f.bytes).digest("hex"),
      fanIn: counts.fanIn,
      fanOut: counts.fanOut,
    };
  });

  return {
    version: RESULT_VERSION,
    root: root.split(path.sep).join("/"),
    adapter: adapter.name,
    files,
    edges,
    imports,
    coverage: buildCoverage(files, imports, walk.ignoredDirectories, resolver.configErrors),
  };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\r|\n/g)?.length ?? 0;
  // A trailing newline ends the last line rather than starting a new one.
  return /[\r\n]$/.test(text) ? breaks : breaks + 1;
}

function buildCoverage(
  files: RepoFile[],
  imports: ImportRecord[],
  ignoredDirectories: string[],
  configErrors: Coverage["configErrors"],
): Coverage {
  // Written out rather than built from the reason lists, so adding a reason
  // fails to compile here until it's counted.
  const skippedBy: Record<SkipReason, number> = {
    "declaration-file": 0,
    "too-large": 0,
    unreadable: 0,
  };
  for (const f of files) if (f.status === "skipped") skippedBy[f.reason] += 1;

  const byKind: Coverage["imports"]["byKind"] = {
    import: { seen: 0, resolved: 0 },
    "re-export": { seen: 0, resolved: 0 },
    "dynamic-import": { seen: 0, resolved: 0 },
  };
  const unresolvedBy: Coverage["imports"]["unresolvedBy"] = {
    "no-file-at-relative-path": 0,
    "no-file-at-alias-target": 0,
    "no-file-at-base-url-path": 0,
    "non-literal-dynamic-import": 0,
  };
  const excludedBy: Coverage["imports"]["excludedBy"] = {
    "target-skipped": 0,
    "non-source-file": 0,
    "ignored-directory": 0,
  };
  const status = { resolved: 0, external: 0, excluded: 0, unresolved: 0 };
  for (const imp of imports) {
    byKind[imp.kind].seen += 1;
    status[imp.outcome.status] += 1;
    if (imp.outcome.status === "resolved") byKind[imp.kind].resolved += 1;
    if (imp.outcome.status === "unresolved") unresolvedBy[imp.outcome.reason] += 1;
    if (imp.outcome.status === "excluded") excludedBy[imp.outcome.reason] += 1;
  }

  const parsed = files.filter((f) => f.status === "parsed").length;
  return {
    files: { found: files.length, parsed, skipped: files.length - parsed, skippedBy },
    imports: { seen: imports.length, ...status, byKind, unresolvedBy, excludedBy },
    ignoredDirectories,
    configErrors,
  };
}
