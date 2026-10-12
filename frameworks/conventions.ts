// Naming conventions that belong to no one framework, and the syntax helpers
// adapters share. Every rule here reads the path or the syntax tree; none of
// them guesses.

import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { FileReading } from "../parser/adapter.ts";

// Generic vendored and build-output names. Dot-directories are hidden by
// convention (.git, caches, build output of frameworks that name theirs so).
const IGNORED_NAMES = new Set(["node_modules", "dist", "build", "out", "coverage"]);

export function ignoresDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_NAMES.has(name);
}

const SCRIPT_EXT = String.raw`\.[cm]?[jt]sx?$`;
const TEST_NAME = new RegExp(String.raw`\.(test|spec)` + SCRIPT_EXT);
const STORY_NAME = new RegExp(String.raw`\.stories` + SCRIPT_EXT);
// vite.config.ts, vitest.config.mts, .eslintrc.js: tool configuration by the
// tools' own naming rules.
const CONFIG_NAME = new RegExp(String.raw`(\.config|^\.?[a-z]+rc)` + SCRIPT_EXT);
// React's own conventions: a component file is named for the component, a
// hook file for the hook, which the rules of hooks require to start with use.
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*\.[jt]sx$/;
const HOOK_NAME = new RegExp(String.raw`^use[A-Z][A-Za-z0-9]*` + SCRIPT_EXT);

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function isTest(path: string): boolean {
  return TEST_NAME.test(fileName(path)) || path.split("/").includes("__tests__");
}

export function isStory(path: string): boolean {
  return STORY_NAME.test(fileName(path));
}

export function isConfig(path: string): boolean {
  return CONFIG_NAME.test(fileName(path));
}

/** Only a top-level scripts folder: deeper ones are too often app code. */
export function isScript(path: string): boolean {
  return path.split("/")[0] === "scripts";
}

export function isComponent(path: string): boolean {
  return COMPONENT_NAME.test(fileName(path));
}

export function isHook(path: string): boolean {
  return HOOK_NAME.test(fileName(path));
}

/** A reading with a role and nothing routable. */
export function roleOnly(role: string | null): FileReading {
  return { role, routes: [], gaps: [] };
}

/** The value of a string literal or a template with no substitutions; null for anything else. */
export function literalString(node: Node | undefined): string | null {
  if (node && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
    return node.getLiteralValue();
  }
  return null;
}

/**
 * Every string in a literal or an array of literals. Null when any part of it
 * isn't a literal: then the values aren't knowable from the syntax.
 */
export function literalStrings(node: Node | undefined): string[] | null {
  if (!node) return null;
  if (Node.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const element of node.getElements()) {
      const value = literalString(element);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  }
  const value = literalString(node);
  return value === null ? null : [value];
}

/** Whether the file's directive prologue contains this directive. */
export function hasDirective(source: SourceFile, directive: string): boolean {
  for (const statement of source.getStatements()) {
    if (!Node.isExpressionStatement(statement)) return false;
    const value = literalString(statement.getExpression());
    if (value === null) return false;
    if (value === directive) return true;
  }
  return false;
}

/**
 * Names the file exports itself, with the line each is declared on. `star` is
 * true when it also re-exports everything from another file, whose names
 * can't be seen from here.
 */
export function exportedNames(source: SourceFile): { names: Map<string, number>; star: boolean } {
  const names = new Map<string, number>();
  let star = false;
  for (const statement of source.getStatements()) {
    if (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) {
      const name = statement.getName();
      if (name && statement.hasExportKeyword() && !statement.hasDefaultKeyword()) {
        names.set(name, statement.getStartLineNumber());
      }
    } else if (Node.isVariableStatement(statement)) {
      if (!statement.hasExportKeyword()) continue;
      for (const declaration of statement.getDeclarations()) {
        const nameNode = declaration.getNameNode();
        if (Node.isIdentifier(nameNode)) names.set(nameNode.getText(), declaration.getStartLineNumber());
      }
    } else if (Node.isExportDeclaration(statement)) {
      if (statement.isTypeOnly()) continue;
      const namespace = statement.getNamespaceExport();
      if (namespace) {
        names.set(namespace.getName(), statement.getStartLineNumber());
      } else if (!statement.hasNamedExports()) {
        star = true;
      }
      for (const specifier of statement.getNamedExports()) {
        if (specifier.isTypeOnly()) continue;
        const name = specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText();
        names.set(name, specifier.getStartLineNumber());
      }
    }
  }
  return { names, star };
}

/** The line of the file's default export, or null when it has none. */
export function defaultExportLine(source: SourceFile): number | null {
  for (const statement of source.getStatements()) {
    if (Node.isExportAssignment(statement) && !statement.isExportEquals()) return statement.getStartLineNumber();
    if (
      (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) &&
      statement.hasExportKeyword() &&
      statement.hasDefaultKeyword()
    ) {
      return statement.getStartLineNumber();
    }
  }
  return exportedNames(source).names.get("default") ?? null;
}

/** Every property named `name` in object literals anywhere in the file, shorthand included. */
export function propertiesNamed(source: SourceFile, name: string): Node[] {
  return [
    ...source.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    ...source.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment),
  ].filter((p) => p.getName() === name);
}
