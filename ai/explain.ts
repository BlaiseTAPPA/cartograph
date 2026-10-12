import { CLASSIFIABLE_ROLES, classifiableRole, type ClassifiableRole } from "../frameworks/taxonomy.ts";
import { ai, MODELS } from "./client.ts";
import { cacheKey, throughCache, type Answer, type AnswerCache } from "./cached.ts";
import { scorePaths } from "./path-feedback.ts";

// The model explains and labels what the parser found. Every path it sees is
// handed to it here, from the stored graph; it is never asked to find a
// connection or follow one. Nothing in this module reads a database or the
// network itself: facts come in, the source comes from a loader, answers go
// through the cache.

/** How a neighbour is reached: import, require and so on. */
export type Neighbour = { path: string; kinds: readonly string[] };

export type FileFacts = {
  repo: string;
  commit: string;
  path: string;
  /** sha256 of the file's bytes, as the parser stored it. */
  hash: string;
  lines: number;
  /** The role convention gave it, or null. A model's earlier label isn't handed back. */
  role: string | null;
  imports: readonly Neighbour[];
  importedBy: readonly Neighbour[];
};

export type FolderFacts = {
  repo: string;
  commit: string;
  dir: string;
  files: readonly { path: string; role: string | null; lines: number }[];
  /** Every edge from a file outside the folder to one inside it. */
  incoming: readonly { from: string; to: string }[];
  /** Every edge from a file inside the folder to one outside it. */
  outgoing: readonly { from: string; to: string }[];
};

// Past this the source is more than one question should hand over. Refused
// rather than cut: an explanation of half a file reads like one of all of it.
export const MAX_SOURCE_BYTES = 100 * 1024;

// The renderer draws exactly these three, so asking for them is safer than
// forbidding formatting and printing whatever comes back.
const FORMATTING = `Formatting: you may use inline code in backticks, bullet lists (lines starting with "- ") and bold (**like this**). Nothing else: no headings, no numbered lists, no tables, no code blocks, no links.`;

const NO_GRADING = `Describe; don't evaluate. No praise, criticism, suggestions, risks or "issues".`;

const PATHS = `Write every file path exactly as given, in backticks. Mention no path that isn't given to you, and don't suggest connections beyond the lists: they are complete, resolved by a parser from the real imports.`;

export const EXPLAIN_FILE = `You explain one file of a TypeScript or JavaScript repository to a developer reading its dependency map.

You are given the file's source and the complete lists of files it imports and files that import it.

Write two or three short paragraphs: what the file does, then how it sits among its neighbours — what it takes from the files it imports, and what the files importing it use it for. Be concrete; name exports and neighbours.

${PATHS}

${NO_GRADING}

${FORMATTING}`;

const EXPLAIN_FOLDER = `You explain one folder of a TypeScript or JavaScript repository to a developer reading its dependency map, where the folder is drawn as one box.

You are given the files in the folder and every import that crosses its boundary, in both directions. You are not given any source.

Answer two questions in two or three short paragraphs: what is in this folder, taken as a whole, and why the files outside it point at it as much as they do — which files inside draw the imports, and from what parts of the repository. This is about the folder, not a tour of one file.

${PATHS}

${NO_GRADING}

${FORMATTING}`;

const CLASSIFY = `You label one file of a TypeScript or JavaScript repository that no framework convention identified.

Choose the one role that describes what the file is:
- service: business logic or operations other code calls
- repository: reads and writes stored data for other code
- model: data shapes, types, schemas or entities
- util: small general-purpose helpers
- config: configuration values or setup
- component: a UI component
- hook: a React hook
- none: none of these fits well

Answer "none" rather than stretch a role to fit.`;

function neighbourLines(list: readonly Neighbour[]): string {
  return list.length === 0 ? "(none)" : list.map((n) => `- \`${n.path}\` (${n.kinds.join(", ")})`).join("\n");
}

/** The user message, with the source or a stand-in for it. */
export function fileMessage(f: FileFacts, source: string): string {
  return `Repository: ${f.repo} at commit ${f.commit}
File: \`${f.path}\` (${f.lines} lines)
Role by convention: ${f.role ?? "none identified"}

Imports (${f.imports.length}):
${neighbourLines(f.imports)}

Imported by (${f.importedBy.length}):
${neighbourLines(f.importedBy)}

Source of \`${f.path}\`:
<source>
${source}
</source>`;
}

/** What stands in for the source in a cache key: its hash, which names it exactly. */
export function sourceRef(f: FileFacts): string {
  return `sha256:${f.hash}`;
}

function folderMessage(f: FolderFacts): string {
  const name = f.dir === "." ? "(the repository root)" : `\`${f.dir}/\``;
  const fanIn = new Map<string, number>();
  for (const e of f.incoming) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  const files = f.files
    .map((x) => `- \`${x.path}\` (${x.role ?? "unclassified"}, ${x.lines} lines, imported by ${fanIn.get(x.path) ?? 0} outside)`)
    .join("\n");
  const grouped = (edges: readonly { from: string; to: string }[]) => {
    const by = new Map<string, string[]>();
    for (const e of edges) by.set(e.from, [...(by.get(e.from) ?? []), e.to]);
    if (by.size === 0) return "(none)";
    return [...by].map(([from, tos]) => `- \`${from}\` imports ${tos.map((t) => `\`${t}\``).join(", ")}`).join("\n");
  };
  return `Repository: ${f.repo} at commit ${f.commit}
Folder: ${name}, ${f.files.length} files. The map folds small subfolders into their parent, so this box holds files from the folders listed below.

Files in it:
${files}

Imports from outside into it (${f.incoming.length}):
${grouped(f.incoming)}

Imports from it to outside (${f.outgoing.length}):
${grouped(f.outgoing)}`;
}

/** Throws when the loaded source isn't what the parser hashed, or is too long to hand over. */
export type SourceLoader = () => Promise<string>;

export async function complete(model: string, system: string, user: string): Promise<string> {
  const response = await ai.chat.completions.create({
    model,
    reasoning_effort: "low",
    messages: [
      { role: "developer", content: system },
      { role: "user", content: user },
    ],
  });
  const text = response.choices[0]?.message.content?.trim();
  if (!text) throw new Error(`${model} returned no text.`);
  return text;
}

export async function explainFile(facts: FileFacts, loadSource: SourceLoader, cache: AnswerCache): Promise<Answer> {
  const model = MODELS.explain;
  return throughCache(
    {
      name: "explain file",
      task: "explain-file",
      model,
      key: cacheKey(model, EXPLAIN_FILE, fileMessage(facts, sourceRef(facts))),
      subject: facts.path,
    },
    cache,
    async () => {
      const message = fileMessage(facts, await loadSource());
      const body = await complete(model, EXPLAIN_FILE, message);
      await scorePaths(body, [EXPLAIN_FILE, message]);
      return body;
    },
  );
}

export async function explainFolder(facts: FolderFacts, cache: AnswerCache): Promise<Answer> {
  const model = MODELS.explain;
  const message = folderMessage(facts);
  return throughCache(
    {
      name: "explain folder",
      task: "explain-folder",
      model,
      key: cacheKey(model, EXPLAIN_FOLDER, message),
      subject: facts.dir,
    },
    cache,
    async () => {
      const body = await complete(model, EXPLAIN_FOLDER, message);
      await scorePaths(body, [EXPLAIN_FOLDER, message]);
      return body;
    },
  );
}

const NONE = "none";
const ROLE_SCHEMA = {
  type: "object",
  properties: { role: { type: "string", enum: [...CLASSIFIABLE_ROLES, NONE] } },
  required: ["role"],
  additionalProperties: false,
} as const;

/**
 * A role for a file no convention identified, from the classifiable roles
 * only, or null when none fits. The answer is checked against the list
 * whatever the schema promised.
 */
export async function classifyFile(
  facts: FileFacts,
  loadSource: SourceLoader,
  cache: AnswerCache,
): Promise<{ role: ClassifiableRole | null; cached: boolean }> {
  const model = MODELS.classify;
  const answer = await throughCache(
    {
      name: "classify file",
      task: "classify",
      model,
      key: cacheKey(model, CLASSIFY, fileMessage(facts, sourceRef(facts))),
      subject: facts.path,
    },
    cache,
    async () => {
      const response = await ai.chat.completions.create({
        model,
        reasoning_effort: "low",
        messages: [
          { role: "developer", content: CLASSIFY },
          { role: "user", content: fileMessage(facts, await loadSource()) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "role", strict: true, schema: ROLE_SCHEMA } },
      });
      const parsed: unknown = JSON.parse(response.choices[0]?.message.content ?? "null");
      const role =
        typeof parsed === "object" && parsed !== null && "role" in parsed && typeof parsed.role === "string"
          ? parsed.role
          : null;
      if (role === null || (role !== NONE && classifiableRole(role) === null)) {
        throw new Error(`${model} answered a role outside the list: ${JSON.stringify(parsed)}`);
      }
      return role;
    },
  );
  if (answer.body === NONE) return { role: null, cached: answer.cached };
  const role = classifiableRole(answer.body);
  if (role === null) throw new Error(`The cached label for ${facts.path} is "${answer.body}", which isn't a classifiable role.`);
  return { role, cached: answer.cached };
}
