// Framework knowledge lives behind this interface. The parser asks the adapter
// and never checks for a framework itself.

export type FrameworkAdapter = {
  name: string;
  /**
   * Whether the walk should skip a directory. Skipped directories are listed in
   * coverage, and imports into them are reported as excluded.
   */
  ignoresDirectory(name: string, relativePath: string): boolean;
};

// Generic vendored and build-output names. None of them belongs to a
// particular framework. Dot-directories are hidden by convention (.git, caches).
const IGNORED_NAMES = new Set(["node_modules", "dist", "build", "out", "coverage"]);

/** Assumes no framework at all. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  ignoresDirectory(name) {
    return name.startsWith(".") || IGNORED_NAMES.has(name);
  },
};
