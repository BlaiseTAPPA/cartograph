import { UNRESOLVED_REASONS, type Coverage, type UnresolvedReason } from "@/parser/types";

export type GraphCompleteness = {
  /**
   * Imports that point at code inside the repository. Packages and builtins
   * aren't part of this graph, and neither are imports of stylesheets or
   * JSON: none of them could ever be an edge.
   */
  intoRepository: number;
  /** Of those, how many became an edge. */
  drawn: number;
  /** Whole percent of intoRepository drawn, rounded down; null with nothing to measure. */
  percent: number | null;
  unresolvedBy: [UnresolvedReason, number][];
  /** Imports of files that exist but are off the map: skipped, or in an ignored directory. */
  offMap: number;
  skippedFiles: number;
  configErrors: number;
  partial: boolean;
};

/**
 * How much of the graph is really there. Rounded down, so a graph missing one
 * edge in a thousand reads 99%, never 100%.
 */
export function completeness(coverage: Coverage): GraphCompleteness {
  const { imports, files } = coverage;
  const offMap = imports.excludedBy["target-skipped"] + imports.excludedBy["ignored-directory"];
  const intoRepository = imports.resolved + imports.unresolved + offMap;
  const drawn = imports.resolved;
  const percent = intoRepository === 0 ? null : Math.floor((drawn * 100) / intoRepository);
  const unresolvedBy = UNRESOLVED_REASONS.map((r): [UnresolvedReason, number] => [r, imports.unresolvedBy[r]]).filter(
    ([, n]) => n > 0,
  );
  return {
    intoRepository,
    drawn,
    percent,
    unresolvedBy,
    offMap,
    skippedFiles: files.skipped,
    configErrors: coverage.configErrors.length,
    partial: drawn < intoRepository || files.skipped > 0 || coverage.configErrors.length > 0,
  };
}
