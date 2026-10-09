import { readFileSync, writeFileSync } from "node:fs";
import {
  EDGE_KINDS,
  EXCLUDED_REASONS,
  EXTERNAL_KINDS,
  RESOLUTION_RULES,
  RESULT_VERSION,
  SKIP_REASONS,
  UNRESOLVED_REASONS,
  type Coverage,
  type Edge,
  type ImportOutcome,
  type ImportRecord,
  type ParseResult,
  type RepoFile,
} from "./types.ts";

export function writeResult(file: string, result: ParseResult): void {
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

/**
 * Reads a result back and checks it field by field, then checks it agrees with
 * itself. Anything off throws with the path to the bad value: a result that
 * half-matches the contract is worse than none.
 */
export function readResult(file: string): ParseResult {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const result = toResult(raw);
  checkConsistency(result);
  return result;
}

class ShapeError extends Error {}

/**
 * Checks a coverage report read back from wherever it was stored, field by
 * field, the same way a whole result is checked.
 */
export function readCoverage(value: unknown): Coverage {
  return toCoverage(value, "coverage");
}

type Obj = { [key: string]: unknown };

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function obj(v: unknown, at: string): Obj {
  if (!isObj(v)) throw new ShapeError(`${at}: expected object`);
  return v;
}

function arr(v: unknown, at: string): unknown[] {
  if (!Array.isArray(v)) throw new ShapeError(`${at}: expected array`);
  return v;
}

function str(v: unknown, at: string): string {
  if (typeof v !== "string") throw new ShapeError(`${at}: expected string`);
  return v;
}

function int(v: unknown, at: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new ShapeError(`${at}: expected count`);
  return v;
}

function oneOf<T extends string>(options: readonly T[], v: unknown, at: string): T {
  const found = options.find((o) => o === v);
  if (found === undefined) throw new ShapeError(`${at}: expected one of ${options.join(", ")}`);
  return found;
}

function toFile(v: unknown, at: string): RepoFile {
  const o = obj(v, at);
  const path = str(o.path, `${at}.path`);
  const folder = str(o.module, `${at}.module`);
  const status = oneOf(["parsed", "skipped"] as const, o.status, `${at}.status`);
  if (status === "skipped") {
    return { status, path, module: folder, reason: oneOf(SKIP_REASONS, o.reason, `${at}.reason`) };
  }
  return {
    status,
    path,
    module: folder,
    lines: int(o.lines, `${at}.lines`),
    hash: str(o.hash, `${at}.hash`),
    fanIn: int(o.fanIn, `${at}.fanIn`),
    fanOut: int(o.fanOut, `${at}.fanOut`),
  };
}

function toEdge(v: unknown, at: string): Edge {
  const o = obj(v, at);
  return {
    from: str(o.from, `${at}.from`),
    to: str(o.to, `${at}.to`),
    kind: oneOf(EDGE_KINDS, o.kind, `${at}.kind`),
  };
}

function toOutcome(v: unknown, at: string): ImportOutcome {
  const o = obj(v, at);
  const status = oneOf(["resolved", "external", "excluded", "unresolved"] as const, o.status, `${at}.status`);
  switch (status) {
    case "resolved":
      return {
        status,
        target: str(o.target, `${at}.target`),
        rules: oneOf(RESOLUTION_RULES, o.rules, `${at}.rules`),
      };
    case "external":
      return { status, via: oneOf(EXTERNAL_KINDS, o.via, `${at}.via`) };
    case "excluded":
      return {
        status,
        reason: oneOf(EXCLUDED_REASONS, o.reason, `${at}.reason`),
        target: str(o.target, `${at}.target`),
      };
    case "unresolved":
      return { status, reason: oneOf(UNRESOLVED_REASONS, o.reason, `${at}.reason`) };
  }
}

function toImport(v: unknown, at: string): ImportRecord {
  const o = obj(v, at);
  return {
    from: str(o.from, `${at}.from`),
    specifier: str(o.specifier, `${at}.specifier`),
    kind: oneOf(EDGE_KINDS, o.kind, `${at}.kind`),
    line: int(o.line, `${at}.line`),
    outcome: toOutcome(o.outcome, `${at}.outcome`),
  };
}

function toCoverage(v: unknown, at: string): Coverage {
  const o = obj(v, at);
  const files = obj(o.files, `${at}.files`);
  const imports = obj(o.imports, `${at}.imports`);
  const byKind = obj(imports.byKind, `${at}.imports.byKind`);
  const skippedBy = obj(files.skippedBy, `${at}.files.skippedBy`);
  const unresolvedBy = obj(imports.unresolvedBy, `${at}.imports.unresolvedBy`);
  const excludedBy = obj(imports.excludedBy, `${at}.imports.excludedBy`);
  const kindCounts = (k: (typeof EDGE_KINDS)[number]) => {
    const c = obj(byKind[k], `${at}.imports.byKind.${k}`);
    return {
      seen: int(c.seen, `${at}.imports.byKind.${k}.seen`),
      resolved: int(c.resolved, `${at}.imports.byKind.${k}.resolved`),
    };
  };
  return {
    files: {
      found: int(files.found, `${at}.files.found`),
      parsed: int(files.parsed, `${at}.files.parsed`),
      skipped: int(files.skipped, `${at}.files.skipped`),
      skippedBy: {
        "declaration-file": int(skippedBy["declaration-file"], `${at}.files.skippedBy.declaration-file`),
        "too-large": int(skippedBy["too-large"], `${at}.files.skippedBy.too-large`),
        unreadable: int(skippedBy.unreadable, `${at}.files.skippedBy.unreadable`),
      },
    },
    imports: {
      seen: int(imports.seen, `${at}.imports.seen`),
      resolved: int(imports.resolved, `${at}.imports.resolved`),
      external: int(imports.external, `${at}.imports.external`),
      excluded: int(imports.excluded, `${at}.imports.excluded`),
      unresolved: int(imports.unresolved, `${at}.imports.unresolved`),
      byKind: {
        import: kindCounts("import"),
        "re-export": kindCounts("re-export"),
        "dynamic-import": kindCounts("dynamic-import"),
      },
      unresolvedBy: {
        "no-file-at-relative-path": int(unresolvedBy["no-file-at-relative-path"], `${at}.imports.unresolvedBy.no-file-at-relative-path`),
        "no-file-at-alias-target": int(unresolvedBy["no-file-at-alias-target"], `${at}.imports.unresolvedBy.no-file-at-alias-target`),
        "no-file-at-base-url-path": int(unresolvedBy["no-file-at-base-url-path"], `${at}.imports.unresolvedBy.no-file-at-base-url-path`),
        "non-literal-dynamic-import": int(unresolvedBy["non-literal-dynamic-import"], `${at}.imports.unresolvedBy.non-literal-dynamic-import`),
      },
      excludedBy: {
        "target-skipped": int(excludedBy["target-skipped"], `${at}.imports.excludedBy.target-skipped`),
        "non-source-file": int(excludedBy["non-source-file"], `${at}.imports.excludedBy.non-source-file`),
        "ignored-directory": int(excludedBy["ignored-directory"], `${at}.imports.excludedBy.ignored-directory`),
      },
    },
    ignoredDirectories: arr(o.ignoredDirectories, `${at}.ignoredDirectories`).map((d, i) =>
      str(d, `${at}.ignoredDirectories[${i}]`),
    ),
    configErrors: arr(o.configErrors, `${at}.configErrors`).map((e, i) => {
      const c = obj(e, `${at}.configErrors[${i}]`);
      return {
        config: str(c.config, `${at}.configErrors[${i}].config`),
        message: str(c.message, `${at}.configErrors[${i}].message`),
      };
    }),
  };
}

function toResult(v: unknown): ParseResult {
  const o = obj(v, "result");
  if (o.version !== RESULT_VERSION) {
    throw new ShapeError(`result.version: expected ${RESULT_VERSION}, got ${String(o.version)}`);
  }
  return {
    version: RESULT_VERSION,
    root: str(o.root, "result.root"),
    adapter: str(o.adapter, "result.adapter"),
    files: arr(o.files, "result.files").map((f, i) => toFile(f, `result.files[${i}]`)),
    edges: arr(o.edges, "result.edges").map((e, i) => toEdge(e, `result.edges[${i}]`)),
    imports: arr(o.imports, "result.imports").map((m, i) => toImport(m, `result.imports[${i}]`)),
    coverage: toCoverage(o.coverage, "result.coverage"),
  };
}

/** The promises the contract makes beyond its types. */
function checkConsistency(r: ParseResult): void {
  const fail = (msg: string) => {
    throw new Error(`Inconsistent result: ${msg}`);
  };
  const parsed = new Set(r.files.filter((f) => f.status === "parsed").map((f) => f.path));
  for (const e of r.edges) {
    if (!parsed.has(e.from)) fail(`edge from ${e.from}, which is not a parsed file`);
    if (!parsed.has(e.to)) fail(`edge to ${e.to}, which is not a parsed file`);
  }
  const { files, imports } = r.coverage;
  if (files.found !== r.files.length) fail("files.found differs from the file list");
  if (files.parsed + files.skipped !== files.found) fail("parsed + skipped differs from found");
  if (imports.seen !== r.imports.length) fail("imports.seen differs from the import list");
  if (imports.resolved + imports.external + imports.excluded + imports.unresolved !== imports.seen) {
    fail("import outcomes do not add up to imports seen");
  }
}
