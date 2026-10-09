import type { ImportRecord, ParseResult, UnresolvedReason } from "../types.ts";

const EXAMPLES_PER_REASON = 5;

const UNRESOLVED_TEXT: Record<UnresolvedReason, string> = {
  "no-file-at-relative-path": "relative path points at no file",
  "no-file-at-alias-target": "path alias matched, but no file at its target",
  "no-file-at-base-url-path": "baseUrl path points at no file",
  "non-literal-dynamic-import": "dynamic import argument is not a string literal",
};

export function printSummary(r: ParseResult): void {
  const { files, imports } = r.coverage;
  const modules = new Set(r.files.map((f) => f.module));

  console.log(`root     ${r.root}`);
  console.log(`adapter  ${r.adapter}`);
  console.log(`\nfiles    ${files.found} found = ${files.parsed} parsed + ${files.skipped} skipped`);
  for (const [reason, n] of Object.entries(files.skippedBy)) {
    if (n > 0) console.log(`           skipped ${n}  ${reason}`);
  }
  console.log(`modules  ${modules.size} distinct folders`);
  console.log(`ignored  ${r.coverage.ignoredDirectories.length} directories not walked`);
  for (const d of r.coverage.ignoredDirectories) console.log(`           ${d}`);

  console.log(
    `\nimports  ${imports.seen} seen = ${imports.resolved} resolved + ${imports.external} external + ${imports.excluded} excluded + ${imports.unresolved} unresolved`,
  );
  for (const [kind, c] of Object.entries(imports.byKind)) {
    console.log(`           ${kind.padEnd(15)} ${c.seen} seen, ${c.resolved} resolved`);
  }
  const viaBundler = r.imports.filter(
    (i) => i.outcome.status === "resolved" && i.outcome.rules === "bundler",
  ).length;
  if (viaBundler > 0) {
    console.log(`           ${viaBundler} of the resolved needed bundler rules (config's Node ESM rules rejected them)`);
  }
  const edgeKinds = new Map<string, number>();
  for (const e of r.edges) edgeKinds.set(e.kind, (edgeKinds.get(e.kind) ?? 0) + 1);
  console.log(
    `edges    ${r.edges.length} after removing duplicates (${[...edgeKinds].map(([k, n]) => `${k} ${n}`).join(", ") || "none"})`,
  );

  printGroup(
    "excluded",
    r.imports.filter((i) => i.outcome.status === "excluded"),
    (i) => (i.outcome.status === "excluded" ? i.outcome.reason : ""),
    (i) => (i.outcome.status === "excluded" ? ` -> ${i.outcome.target}` : ""),
  );
  printGroup(
    "unresolved",
    r.imports.filter((i) => i.outcome.status === "unresolved"),
    (i) => (i.outcome.status === "unresolved" ? UNRESOLVED_TEXT[i.outcome.reason] : ""),
    () => "",
  );

  if (r.coverage.configErrors.length > 0) {
    console.log(`\nconfig problems (resolution under these may be incomplete)`);
    for (const e of r.coverage.configErrors) console.log(`  ${e.config}: ${e.message}`);
  }
}

function printGroup(
  title: string,
  records: ImportRecord[],
  reasonOf: (i: ImportRecord) => string,
  detail: (i: ImportRecord) => string,
): void {
  if (records.length === 0) return;
  console.log(`\n${title}`);
  const groups = new Map<string, ImportRecord[]>();
  for (const rec of records) {
    const reason = reasonOf(rec);
    groups.set(reason, [...(groups.get(reason) ?? []), rec]);
  }
  for (const [reason, recs] of groups) {
    console.log(`  ${recs.length}  ${reason}`);
    for (const rec of recs.slice(0, EXAMPLES_PER_REASON)) {
      console.log(`       ${rec.from}:${rec.line}  "${rec.specifier}"${detail(rec)}`);
    }
    if (recs.length > EXAMPLES_PER_REASON) {
      console.log(`       … ${recs.length - EXAMPLES_PER_REASON} more in the output file`);
    }
  }
}
