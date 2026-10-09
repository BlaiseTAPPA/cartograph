// Framework knowledge lives behind this interface. The parser asks the adapter
// and never checks for a framework itself.

/**
 * What sort of thing a file is, by naming convention alone. A file no
 * convention identifies has no category: it is reported as unclassified, never
 * given a best guess.
 */
export const FILE_CATEGORIES = ["test", "story", "config", "script"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export type FrameworkAdapter = {
  name: string;
  /**
   * Whether the walk should skip a directory. Skipped directories are listed in
   * coverage, and imports into them are reported as excluded.
   */
  ignoresDirectory(name: string, relativePath: string): boolean;
  /**
   * The category a file's path puts it in, or null when no convention applies.
   * Not part of the parse result: it is derived from the path whenever needed,
   * so the rule can change without re-parsing.
   */
  categorize(path: string): FileCategory | null;
};

// Generic vendored and build-output names. None of them belongs to a
// particular framework. Dot-directories are hidden by convention (.git, caches).
const IGNORED_NAMES = new Set(["node_modules", "dist", "build", "out", "coverage"]);

const SCRIPT_EXT = String.raw`\.[cm]?[jt]sx?$`;
const TEST_NAME = new RegExp(String.raw`\.(test|spec)` + SCRIPT_EXT);
const STORY_NAME = new RegExp(String.raw`\.stories` + SCRIPT_EXT);
// vite.config.ts, vitest.config.mts, .eslintrc.js: tool configuration by the
// tools' own naming rules.
const CONFIG_NAME = new RegExp(String.raw`(\.config|^\.?[a-z]+rc)` + SCRIPT_EXT);

/** Assumes no framework at all. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  ignoresDirectory(name) {
    return name.startsWith(".") || IGNORED_NAMES.has(name);
  },
  categorize(path) {
    const segments = path.split("/");
    const name = segments[segments.length - 1];
    if (TEST_NAME.test(name) || segments.includes("__tests__")) return "test";
    if (STORY_NAME.test(name)) return "story";
    if (CONFIG_NAME.test(name)) return "config";
    // Only a top-level scripts folder: deeper ones are too often app code.
    if (segments[0] === "scripts") return "script";
    return null;
  },
};

const ADAPTERS: readonly FrameworkAdapter[] = [fallbackAdapter];

/** The adapter a result names. Throws rather than falling back to another. */
export function adapterNamed(name: string): FrameworkAdapter {
  const adapter = ADAPTERS.find((a) => a.name === name);
  if (!adapter) throw new Error(`No adapter named "${name}"`);
  return adapter;
}
