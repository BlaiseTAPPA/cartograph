import { Project, ts, type SourceFile } from "ts-morph";

// One in-memory project reused for every file. Nothing is type-checked and no
// file is pulled in through its imports; we only want each file's syntax tree.
const project = new Project({
  useInMemoryFileSystem: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
});

/**
 * Parses one file and hands its tree to `read`, then drops it. Holding every
 * tree of a large repository at once would run out of memory, so nothing may
 * keep the tree past the callback.
 */
export function withSyntax<T>(fileName: string, text: string, read: (source: SourceFile) => T): T {
  const source = project.createSourceFile(fileName, text, { overwrite: true });
  try {
    return read(source);
  } finally {
    project.removeSourceFile(source);
  }
}
