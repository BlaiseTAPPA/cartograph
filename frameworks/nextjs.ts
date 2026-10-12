// Everything this application knows about Next.js. Roles come from where a
// file sits, routes from those same positions. Nothing outside this file may
// know a Next.js convention.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Node } from "ts-morph";
import type { FileReading, FileSyntax, FrameworkAdapter } from "../parser/adapter.ts";
import { withSyntax } from "../parser/syntax.ts";
import type { Route, RouteGap } from "../parser/types.ts";
import {
  defaultExportLine,
  exportedNames,
  fileName,
  hasDirective,
  ignoresDirectory,
  isTest,
  literalString,
  propertiesNamed,
} from "./conventions.ts";
import { supportRole } from "./generic.ts";
import { joinRel, nearestDir, withinDir } from "./packages.ts";
import { reactRole } from "./react.ts";

export const NEXTJS_DEPENDENCY = "next";

// The default page extensions. A config that changes them changes which
// files are pages, so such an app gets neither page roles nor routes.
const PAGE_EXT = String.raw`\.(tsx|ts|jsx|js)$`;
const APP_PAGE = new RegExp(String.raw`^page` + PAGE_EXT);
const APP_ROUTE = new RegExp(String.raw`^route` + PAGE_EXT);
const APP_LAYOUT = new RegExp(String.raw`^(layout|template|default)` + PAGE_EXT);
const APP_BOUNDARY = new RegExp(String.raw`^(loading|error|global-error|not-found|forbidden|unauthorized)` + PAGE_EXT);
const PAGES_FILE = new RegExp(PAGE_EXT);
const MIDDLEWARE = /^(middleware|proxy)\.[cm]?[jt]s$/;
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] as const;
// Next reads the first of these that exists.
const CONFIG_FILES = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts", "next.config.mts"];

type NextApp = {
  /** Folder holding the package.json that depends on next. */
  dir: string;
  appDir: string | null;
  pagesDir: string | null;
  /** False when the config changes page extensions: no page roles or routes then. */
  conventional: boolean;
  /** Prepended to every route. Null when it can't be read exactly: no routes then. */
  basePath: string | null;
};

export function nextjsAdapter(root: string, appDirs: readonly string[]): FrameworkAdapter {
  const repositoryGaps: RouteGap[] = [];
  const apps = appDirs.map((dir) => readApp(root, dir, repositoryGaps));
  const byDir = new Map(apps.map((a) => [a.dir, a]));

  return {
    name: "nextjs",
    ignoresDirectory,
    read(file) {
      if (isTest(file.path)) return { role: "test", routes: [], gaps: [] };
      const appDir = nearestDir(appDirs, file.path);
      const app = appDir === null ? undefined : byDir.get(appDir);
      const reading = app ? readInApp(app, file) : null;
      if (reading) return reading;
      // A server action file is one whose prologue says so; the directive is
      // the convention, wherever the file sits.
      if (hasDirective(file.syntax, "use server")) return { role: "action", routes: [], gaps: [] };
      return { role: supportRole(file.path) ?? reactRole(file.path), routes: [], gaps: [] };
    },
    repositoryGaps,
  };
}

/**
 * Next prefers app/ and pages/ at the app's root, and only looks in src/ when
 * neither is there.
 */
function readApp(root: string, dir: string, gaps: RouteGap[]): NextApp {
  const isDir = (rel: string) => {
    const abs = path.join(root, rel);
    return existsSync(abs) && statSync(abs).isDirectory();
  };
  const atRoot = isDir(joinRel(dir, "app")) || isDir(joinRel(dir, "pages"));
  const base = atRoot ? dir : joinRel(dir, "src");
  const appDir = isDir(joinRel(base, "app")) ? joinRel(base, "app") : null;
  const pagesDir = isDir(joinRel(base, "pages")) ? joinRel(base, "pages") : null;

  const configs = CONFIG_FILES.map((f) => joinRel(dir, f)).filter((f) => existsSync(path.join(root, f)));
  if (configs.length === 0) return { dir, appDir, pagesDir, conventional: true, basePath: "" };
  const config = configs[0];
  const where = dir === "" ? "this app" : dir;

  return withSyntax(path.join(root, config), readFileSync(path.join(root, config), "utf8"), (syntax) => {
    let conventional = true;
    let basePath: string | null = "";
    const extensions = propertiesNamed(syntax, "pageExtensions");
    if (extensions.length > 0) {
      conventional = false;
      gaps.push({
        file: config,
        line: extensions[0].getStartLineNumber(),
        reason: `pageExtensions is set, which changes which files are pages: no page roles or routes for ${where}`,
      });
    }
    const declared = propertiesNamed(syntax, "basePath");
    if (declared.length > 0) {
      // Shorthand `basePath,` names a variable: its value isn't in the syntax here.
      const values = declared.map((p) => (Node.isPropertyAssignment(p) ? literalString(p.getInitializer()) : null));
      const first = values[0];
      if (first === null || values.some((v) => v !== first)) {
        basePath = null;
        gaps.push({
          file: config,
          line: declared[0].getStartLineNumber(),
          reason: `basePath isn't a single string literal, so the full path of every route in ${where} is unknown: none shown`,
        });
      } else {
        basePath = first;
      }
    }
    return { dir, appDir, pagesDir, conventional, basePath };
  });
}

function readInApp(app: NextApp, file: FileSyntax): FileReading | null {
  const inApp = withinDir(app.dir, file.path);
  // Middleware (proxy, since Next 16) sits at the app's root, or in src/.
  if (MIDDLEWARE.test(fileName(inApp)) && /^(src\/)?[^/]+$/.test(inApp)) {
    return { role: "middleware", routes: [], gaps: [] };
  }
  if (!app.conventional) return null;
  if (app.appDir !== null && file.path.startsWith(`${app.appDir}/`)) return readAppRouter(app, withinDir(app.appDir, file.path), file);
  if (app.pagesDir !== null && file.path.startsWith(`${app.pagesDir}/`)) return readPagesRouter(app, withinDir(app.pagesDir, file.path), file);
  return null;
}

function readAppRouter(app: NextApp, inAppDir: string, file: FileSyntax): FileReading | null {
  const segments = inAppDir.split("/").slice(0, -1);
  const name = fileName(inAppDir);
  // A folder starting with an underscore is private: nothing in it routes.
  if (segments.some((s) => s.startsWith("_"))) return null;

  if (APP_LAYOUT.test(name)) return { role: "layout", routes: [], gaps: [] };
  if (APP_BOUNDARY.test(name)) return { role: "boundary", routes: [], gaps: [] };
  const isPage = APP_PAGE.test(name);
  const isHandler = APP_ROUTE.test(name);
  if (!isPage && !isHandler) return null;
  const role = isPage ? "page" : "api";

  const intercepting = segments.find((s) => s.startsWith("(."));
  if (intercepting) {
    return {
      role,
      routes: [],
      gaps: [{ file: file.path, line: null, reason: `intercepting segment ${intercepting}: its URL depends on where it's navigated from` }],
    };
  }
  if (app.basePath === null) return { role, routes: [], gaps: [] };
  // Route groups (name) and parallel slots @name don't appear in the URL.
  const kept = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"));
  const pattern = withBase(app.basePath, kept);

  if (isPage) {
    const line = defaultExportLine(file.syntax);
    if (line === null) {
      return { role, routes: [], gaps: [{ file: file.path, line: null, reason: "page file with no default export" }] };
    }
    return { role, routes: [{ method: "page", path: pattern, file: file.path, line }], gaps: [] };
  }
  return { role, ...handlerRoutes(file, pattern) };
}

/** A route handler's methods are the HTTP method names it exports. */
function handlerRoutes(file: FileSyntax, pattern: string): Pick<FileReading, "routes" | "gaps"> {
  const { names, star } = exportedNames(file.syntax);
  const routes: Route[] = HTTP_METHODS.flatMap((method) => {
    const line = names.get(method);
    return line === undefined ? [] : [{ method, path: pattern, file: file.path, line }];
  });
  const gaps: RouteGap[] = [];
  if (star) {
    gaps.push({ file: file.path, line: null, reason: "re-exports everything from another file, so some of its methods may not be visible here" });
  } else if (routes.length === 0) {
    gaps.push({ file: file.path, line: null, reason: "route handler exporting no HTTP method by name" });
  }
  return { routes, gaps };
}

function readPagesRouter(app: NextApp, inPagesDir: string, file: FileSyntax): FileReading | null {
  if (!PAGES_FILE.test(inPagesDir)) return null;
  const segments = inPagesDir.replace(PAGES_FILE, "").split("/");
  if (segments.length === 1) {
    if (segments[0] === "_app" || segments[0] === "_document") return { role: "layout", routes: [], gaps: [] };
    if (segments[0] === "_error") return { role: "boundary", routes: [], gaps: [] };
  }
  if (segments[0] === "api") {
    return {
      role: "api",
      routes: [],
      gaps: [{ file: file.path, line: null, reason: "pages/api handler: the method is decided at runtime inside the handler, not in the syntax" }],
    };
  }
  if (app.basePath === null) return { role: "page", routes: [], gaps: [] };
  const line = defaultExportLine(file.syntax);
  if (line === null) {
    return { role: "page", routes: [], gaps: [{ file: file.path, line: null, reason: "page file with no default export" }] };
  }
  // index stands for its folder.
  const kept = segments[segments.length - 1] === "index" ? segments.slice(0, -1) : segments;
  return { role: "page", routes: [{ method: "page", path: withBase(app.basePath, kept), file: file.path, line }], gaps: [] };
}

function withBase(basePath: string, segments: string[]): string {
  const tail = segments.length === 0 ? "" : `/${segments.join("/")}`;
  if (basePath === "") return tail === "" ? "/" : tail;
  return `${basePath}${tail}`;
}
