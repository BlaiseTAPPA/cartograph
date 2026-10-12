import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { EdgeKind } from "./types.ts";

export type FoundImport = {
  kind: EdgeKind;
  line: number;
  /** Null when a dynamic import's or require's argument isn't a string literal. */
  specifier: string | null;
  /** Source text of the argument, kept so a non-literal import can be shown. */
  text: string;
  /**
   * Which resolution rules apply. `import()` is always ESM, `require()` and
   * `import x = require()` always CommonJS; a plain import follows its file.
   */
  mode: "file" | "esm" | "cjs";
};

export function findImports(source: SourceFile): FoundImport[] {
  const found: FoundImport[] = [];

  for (const decl of source.getImportDeclarations()) {
    const spec = decl.getModuleSpecifier();
    found.push({
      kind: "import",
      line: decl.getStartLineNumber(),
      specifier: spec.getLiteralValue(),
      text: spec.getText(),
      mode: "file",
    });
  }

  for (const decl of source.getExportDeclarations()) {
    const spec = decl.getModuleSpecifier();
    if (!spec) continue; // `export { a }` with no `from` names no other file
    found.push({
      kind: "re-export",
      line: decl.getStartLineNumber(),
      specifier: spec.getLiteralValue(),
      text: spec.getText(),
      mode: "file",
    });
  }

  // `import x = require("y")` is TypeScript import syntax, not a require() call.
  // The grammar only allows a string literal there.
  for (const decl of source.getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)) {
    const ref = decl.getModuleReference();
    if (!Node.isExternalModuleReference(ref)) continue;
    const expr = ref.getExpression();
    if (!expr || !Node.isStringLiteral(expr)) continue;
    found.push({
      kind: "import",
      line: decl.getStartLineNumber(),
      specifier: expr.getLiteralValue(),
      text: expr.getText(),
      mode: "cjs",
    });
  }

  const requireIsNodes = !bindsRequire(source);
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const arg = call.getArguments()[0];
    const literal =
      arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
        ? arg.getLiteralValue()
        : null;
    if (callee.getKind() === SyntaxKind.ImportKeyword) {
      found.push({
        kind: "dynamic-import",
        line: call.getStartLineNumber(),
        specifier: literal,
        text: arg ? arg.getText() : "",
        mode: "esm",
      });
    } else if (requireIsNodes && Node.isIdentifier(callee) && callee.getText() === "require") {
      // `require.resolve()` and `x.require()` have other callees and load nothing.
      if (!arg) continue;
      found.push({
        kind: "require",
        line: call.getStartLineNumber(),
        specifier: literal,
        text: arg.getText(),
        mode: "cjs",
      });
    }
  }

  return found;
}

/**
 * Whether the file declares its own `require`. Its calls are then to whatever
 * it declared, which can't be known from here, so none of them are read as
 * loading a module.
 */
function bindsRequire(source: SourceFile): boolean {
  return source.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
    if (id.getText() !== "require") return false;
    const parent = id.getParent();
    if (Node.isImportClause(parent)) return parent.getDefaultImport() === id;
    if (Node.isImportSpecifier(parent)) return (parent.getAliasNode() ?? parent.getNameNode()) === id;
    return (
      (Node.isVariableDeclaration(parent) ||
        Node.isParameterDeclaration(parent) ||
        Node.isFunctionDeclaration(parent) ||
        Node.isClassDeclaration(parent) ||
        Node.isBindingElement(parent) ||
        Node.isNamespaceImport(parent) ||
        Node.isImportEqualsDeclaration(parent)) &&
      parent.getNameNode() === id
    );
  });
}
