// Framework knowledge lives behind this interface. The parser asks the adapter
// and never checks for a framework itself.

/**
 * What sort of thing a file is, by naming convention alone. A file no
 * convention identifies has no category: it is reported as unclassified, never
 * given a best guess.
 *
 * Every category here is something a framework or a tool reaches by name, not
 * through an import: a route, a test runner's file, a tool's config. So a file
 * in any of them being imported by nothing says nothing about the file.
 */
export const FILE_CATEGORIES = ["entry", "test", "story", "config", "script"] as const;
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
// Next.js file conventions, matched by path alone. App router special files
// sit under an app/ folder; every file under a pages/ folder is a route.
// middleware is distinctive enough to match anywhere; Next 16's proxy.ts is
// not, so it isn't matched.
const APP_ROUTER_NAME = new RegExp(
  String.raw`^(page|layout|route|template|default|loading|error|global-error|not-found)` + SCRIPT_EXT,
);
const MIDDLEWARE_NAME = new RegExp(String.raw`^middleware` + SCRIPT_EXT);

/**
 * Assumes no framework is installed, but still recognises Next.js routes by
 * path: a monorepo can hold a Next app in one folder and nothing in the rest.
 */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  ignoresDirectory(name) {
    return name.startsWith(".") || IGNORED_NAMES.has(name);
  },
  categorize(path) {
    const segments = path.split("/");
    const name = segments[segments.length - 1];
    if (TEST_NAME.test(name) || segments.includes("__tests__")) return "test";
    const folders = segments.slice(0, -1);
    if (folders.includes("app") && APP_ROUTER_NAME.test(name)) return "entry";
    if (folders.includes("pages") || MIDDLEWARE_NAME.test(name)) return "entry";
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
