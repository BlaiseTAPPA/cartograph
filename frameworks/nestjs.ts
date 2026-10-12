// Everything this application knows about NestJS. Roles come from filename
// suffixes; routes from the @Controller decorator and the method decorator
// together, and only when nothing else in the code can change the path.

import { readFileSync } from "node:fs";
import path from "node:path";
import { Node, SyntaxKind, type Decorator, type SourceFile } from "ts-morph";
import type { FileReading, FileSyntax, FrameworkAdapter } from "../parser/adapter.ts";
import { withSyntax } from "../parser/syntax.ts";
import type { Route, RouteGap } from "../parser/types.ts";
import { fileName, ignoresDirectory, isTest, literalStrings } from "./conventions.ts";
import { supportRole } from "./generic.ts";
import { nearestDir } from "./packages.ts";

export const NESTJS_DEPENDENCY = "@nestjs/core";

const COMMON = "@nestjs/common";
const CORE = "@nestjs/core";

// Each suffix is the role's own name.
const SUFFIX = /\.(controller|resolver|service|module|entity|dto|guard|interceptor|pipe|filter|middleware)\.[cm]?[jt]s$/;

// @nestjs/common's route decorators and the method each one answers to.
const METHOD_DECORATORS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
  Search: "SEARCH",
  All: "ALL",
};

/**
 * What an app's global setup does to every path. Null prefix: something in
 * the code changes paths in a way that can't be read exactly, so no route in
 * that app is shown.
 */
type NestApp = { dir: string; prefix: string | null };

export function nestjsAdapter(root: string, appDirs: readonly string[], sourcePaths: readonly string[]): FrameworkAdapter {
  const repositoryGaps: RouteGap[] = [];
  const apps = readApps(root, appDirs, sourcePaths, repositoryGaps);

  return {
    name: "nestjs",
    ignoresDirectory,
    read(file) {
      const role = roleOf(file.path);
      // Routes come from the decorators, wherever the class is, not from the
      // file's name: a controller in a file called anything is still routed.
      return { role, ...routesIn(file, apps) };
    },
    repositoryGaps,
  };
}

function roleOf(path: string): string | null {
  if (isTest(path)) return "test";
  return SUFFIX.exec(fileName(path))?.[1] ?? supportRole(path);
}

/**
 * Reads each app's global setup: setGlobalPrefix, enableVersioning and
 * RouterModule. Only files mentioning one of them are parsed, since the rest
 * can't hold the call. A literal prefix with no options is added to every
 * path; anything else hides that app's routes, with the reason.
 */
function readApps(root: string, appDirs: readonly string[], sourcePaths: readonly string[], gaps: RouteGap[]): Map<string, NestApp> {
  // The first place each app sets its prefix.
  const prefixes = new Map<string, { value: string; file: string; line: number }>();
  const unknown = new Set<string>();
  const hide = (dir: string, file: string, line: number, reason: string) => {
    unknown.add(dir);
    gaps.push({ file, line, reason: `${reason}: no routes shown for ${dir === "" ? "this app" : dir}` });
  };

  for (const rel of sourcePaths) {
    const dir = nearestDir(appDirs, rel);
    if (dir === null) continue;
    const text = readFileSync(path.join(root, rel), "utf8");
    if (!/setGlobalPrefix|enableVersioning|RouterModule/.test(text)) continue;
    withSyntax(path.join(root, rel), text, (syntax) => {
      for (const decl of syntax.getImportDeclarations()) {
        if (decl.getModuleSpecifierValue() !== CORE) continue;
        if (decl.getNamedImports().some((n) => n.getName() === "RouterModule")) {
          hide(dir, rel, decl.getStartLineNumber(), "RouterModule adds path prefixes per module");
        }
      }
      syntax.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;
        const callee = node.getExpression();
        if (!Node.isPropertyAccessExpression(callee)) return;
        const method = callee.getName();
        const line = node.getStartLineNumber();
        if (method === "enableVersioning") {
          hide(dir, rel, line, "enableVersioning can add a version to every path");
        } else if (method === "setGlobalPrefix") {
          const args = node.getArguments();
          const values = args.length === 1 ? literalStrings(args[0]) : null;
          if (values === null || values.length !== 1) {
            hide(dir, rel, line, "setGlobalPrefix isn't called with a single string literal and no options");
          } else {
            const first = prefixes.get(dir);
            if (!first) prefixes.set(dir, { value: values[0], file: rel, line });
            else if (first.value !== values[0]) {
              hide(dir, rel, line, `setGlobalPrefix is called with "${values[0]}" here and "${first.value}" in ${first.file}`);
            }
          }
        }
      });
    });
  }

  const apps = new Map<string, NestApp>();
  for (const dir of appDirs) {
    apps.set(dir, { dir, prefix: unknown.has(dir) ? null : (prefixes.get(dir)?.value ?? "") });
  }
  return apps;
}

/** Local names that refer to @nestjs/common's exports, and namespaces bound to it. */
type CommonNames = { named: Map<string, string>; namespaces: Set<string> };

function commonNames(syntax: SourceFile): CommonNames {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const decl of syntax.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== COMMON) continue;
    const ns = decl.getNamespaceImport();
    if (ns) namespaces.add(ns.getText());
    for (const spec of decl.getNamedImports()) {
      named.set(spec.getAliasNode()?.getText() ?? spec.getName(), spec.getName());
    }
  }
  return { named, namespaces };
}

/** The @nestjs/common export a decorator calls, or null when it calls something else. */
function commonExport(decorator: Decorator, names: CommonNames): string | null {
  const call = decorator.getCallExpression();
  if (!call) return null;
  const callee = call.getExpression();
  if (Node.isIdentifier(callee)) return names.named.get(callee.getText()) ?? null;
  if (Node.isPropertyAccessExpression(callee)) {
    const target = callee.getExpression();
    if (Node.isIdentifier(target) && names.namespaces.has(target.getText())) return callee.getName();
  }
  return null;
}

function routesIn(file: FileSyntax, apps: Map<string, NestApp>): Pick<FileReading, "routes" | "gaps"> {
  const routes: Route[] = [];
  const gaps: RouteGap[] = [];
  const names = commonNames(file.syntax);
  if (names.named.size === 0 && names.namespaces.size === 0) return { routes, gaps };

  const gap = (line: number, reason: string) => gaps.push({ file: file.path, line, reason });
  const dir = nearestDir([...apps.keys()], file.path);
  const app = dir === null ? undefined : apps.get(dir);

  for (const cls of file.syntax.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
    const decorators = cls.getDecorators();
    const controller = decorators.find((d) => commonExport(d, names) === "Controller");
    const handlers = cls.getMethods().flatMap((m) =>
      m.getDecorators().flatMap((d) => {
        const exported = commonExport(d, names);
        const method = exported === null ? undefined : METHOD_DECORATORS[exported];
        return method === undefined ? [] : [{ member: m, decorator: d, method }];
      }),
    );

    if (!controller) {
      if (handlers.length > 0) {
        gap(cls.getStartLineNumber(), "route decorators on a class without @Controller: their path depends on which controller extends it");
      }
      continue;
    }
    const className = cls.getName() ?? "anonymous class";
    if (!app) {
      gap(controller.getStartLineNumber(), `${className} is outside every NestJS app's folder, so its global prefix is unknown`);
      continue;
    }
    // The app-wide gap already says why; repeating it per controller adds nothing.
    if (app.prefix === null) continue;

    const base = controllerPaths(controller);
    if (typeof base === "string") {
      gap(controller.getStartLineNumber(), `${className}: ${base}`);
      continue;
    }
    if (decorators.some((d) => commonExport(d, names) === "Version")) {
      gap(controller.getStartLineNumber(), `${className} is versioned, which changes its paths`);
      continue;
    }
    const heritage = cls.getExtends();
    if (heritage) {
      gap(cls.getStartLineNumber(), `${className} extends ${heritage.getExpression().getText()}: any handlers it inherits aren't listed`);
    }

    for (const { member, decorator, method } of handlers) {
      const line = decorator.getStartLineNumber();
      if (member.getDecorators().some((d) => commonExport(d, names) === "Version")) {
        gap(line, `${className}.${member.getName()} is versioned, which changes its path`);
        continue;
      }
      const args = decorator.getCallExpression()?.getArguments() ?? [];
      const own = args.length === 0 ? [""] : args.length === 1 ? literalStrings(args[0]) : null;
      if (own === null) {
        gap(line, `${className}.${member.getName()}: the path isn't a string literal`);
        continue;
      }
      for (const b of base) {
        for (const o of own) routes.push({ method, path: joinPath(app.prefix, b, o), file: file.path, line });
      }
    }
  }
  return { routes, gaps };
}

/** The controller's own paths, or why they can't be read. */
function controllerPaths(controller: Decorator): string[] | string {
  const args = controller.getCallExpression()?.getArguments() ?? [];
  if (args.length === 0) return [""];
  if (args.length > 1) return "@Controller has more than one argument";
  const arg = args[0];
  if (Node.isObjectLiteralExpression(arg)) {
    if (arg.getProperty("host")) return "@Controller is bound to a host";
    if (arg.getProperty("version")) return "@Controller is versioned, which changes its paths";
    const pathProp = arg.getProperty("path");
    if (!pathProp) return [""];
    if (!Node.isPropertyAssignment(pathProp)) return "the controller path isn't a string literal";
    return literalStrings(pathProp.getInitializer()) ?? "the controller path isn't a string literal";
  }
  return literalStrings(arg) ?? "the controller path isn't a string literal";
}

/** Nest joins the pieces with single slashes, whatever slashes each carries. */
function joinPath(...parts: string[]): string {
  const segments = parts.flatMap((p) => p.split("/")).filter((s) => s !== "");
  return `/${segments.join("/")}`;
}
