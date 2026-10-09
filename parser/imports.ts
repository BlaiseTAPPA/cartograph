import { Node, Project, SyntaxKind, ts, type SourceFile } from "ts-morph";
import type { EdgeKind } from "./types.ts";

export type FoundImport = {
  kind: EdgeKind;
  line: number;
  /** Null when a dynamic import's argument isn't a string literal. */
  specifier: string | null;
  /** Source text of the argument, kept so a non-literal import can be shown. */
  text: string;
  /**
   * Which resolution rules apply. `import()` is always ESM and
   * `import x = require()` always CommonJS; a plain import follows its file.
   */
  mode: "file" | "esm" | "cjs";
};

// One in-memory project reused for every file. Nothing is type-checked and no
// file is pulled in through its imports; we only want each file's syntax tree.
const project = new Project({
  useInMemoryFileSystem: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
});

export function findImports(fileName: string, text: string): FoundImport[] {
  const source = project.createSourceFile(fileName, text, { overwrite: true });
  try {
    return collect(source);
  } finally {
    project.removeSourceFile(source);
  }
}

function collect(source: SourceFile): FoundImport[] {
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

  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const arg = call.getArguments()[0];
    const literal =
      arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
        ? arg.getLiteralValue()
        : null;
    found.push({
      kind: "dynamic-import",
      line: call.getStartLineNumber(),
      specifier: literal,
      text: arg ? arg.getText() : "",
      mode: "esm",
    });
  }

  return found;
}
