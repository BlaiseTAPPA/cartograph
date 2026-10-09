// The shape the parser writes. Everything downstream reads this, so a change
// here is a change to a contract: bump RESULT_VERSION when it changes.

export const RESULT_VERSION = 1;

export const EDGE_KINDS = ["import", "re-export", "dynamic-import"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const SKIP_REASONS = ["declaration-file", "too-large", "unreadable"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const UNRESOLVED_REASONS = [
  "no-file-at-relative-path",
  "no-file-at-alias-target",
  "no-file-at-base-url-path",
  "non-literal-dynamic-import",
] as const;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

export const EXCLUDED_REASONS = [
  "target-skipped",
  "non-source-file",
  "ignored-directory",
] as const;
export type ExcludedReason = (typeof EXCLUDED_REASONS)[number];

export const EXTERNAL_KINDS = ["package", "builtin", "outside-root"] as const;
export type ExternalKind = (typeof EXTERNAL_KINDS)[number];

/** Paths are relative to the parsed root, always with forward slashes. */
export type ParsedFile = {
  status: "parsed";
  path: string;
  /** The folder the file sits in. "." for the root. */
  module: string;
  lines: number;
  /** sha256 of the file's bytes, hex. */
  hash: string;
  fanIn: number;
  fanOut: number;
};

export type SkippedFile = {
  status: "skipped";
  path: string;
  module: string;
  reason: SkipReason;
};

export type RepoFile = ParsedFile | SkippedFile;

/** Both ends are always parsed files present in `files`. */
export type Edge = {
  from: string;
  to: string;
  kind: EdgeKind;
};

export const RESOLUTION_RULES = ["config", "bundler"] as const;
/**
 * Which rules found the target: the governing tsconfig's own, or TypeScript's
 * bundler rules after the config's strict Node ESM rules failed.
 */
export type ResolutionRules = (typeof RESOLUTION_RULES)[number];

export type ImportOutcome =
  | { status: "resolved"; target: string; rules: ResolutionRules }
  | { status: "external"; via: ExternalKind }
  | { status: "excluded"; reason: ExcludedReason; target: string }
  | { status: "unresolved"; reason: UnresolvedReason };

/** Every import the parser saw, whatever happened to it. */
export type ImportRecord = {
  from: string;
  /** The literal string, or the argument's source text for a non-literal dynamic import. */
  specifier: string;
  kind: EdgeKind;
  line: number;
  outcome: ImportOutcome;
};

export type Coverage = {
  files: {
    found: number;
    parsed: number;
    skipped: number;
    skippedBy: Record<SkipReason, number>;
  };
  imports: {
    seen: number;
    resolved: number;
    external: number;
    excluded: number;
    unresolved: number;
    byKind: Record<EdgeKind, { seen: number; resolved: number }>;
    unresolvedBy: Record<UnresolvedReason, number>;
    excludedBy: Record<ExcludedReason, number>;
  };
  /** Directories the walk did not enter, relative to the root. */
  ignoredDirectories: string[];
  /** Problems reading a tsconfig. Resolution under that config may be incomplete. */
  configErrors: { config: string; message: string }[];
};

export type ParseResult = {
  version: typeof RESULT_VERSION;
  /** Absolute path that was parsed. */
  root: string;
  adapter: string;
  files: RepoFile[];
  /** Deduplicated on (from, to, kind). */
  edges: Edge[];
  imports: ImportRecord[];
  coverage: Coverage;
};
