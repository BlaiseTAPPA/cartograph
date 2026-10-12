import type { AnswerCache } from "../ai/cached.ts";
import type { FileFacts, Neighbour } from "../ai/explain.ts";

// What a dataset example holds, and the one way back from LangSmith's untyped
// JSON into it. A stored example that doesn't match throws rather than being
// half-read.

export const ROLE_DATASET = "cartograph-roles";
export const EXPLAIN_DATASET = "cartograph-explanations";

/** A file as the model is handed it: the facts from the stored graph and the source the parser hashed. */
export type FileExample = { facts: FileFacts; source: string };

/**
 * An eval measures the model, so every question misses. The read still
 * happens inside the traced call, where a production one would.
 */
export const NO_CACHE: AnswerCache = {
  read: async () => null,
  write: async () => {},
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`Example field ${key} isn't a string.`);
  return v;
}

function neighbours(v: unknown, key: string): Neighbour[] {
  if (!Array.isArray(v)) throw new Error(`Example field ${key} isn't a list.`);
  return v.map((n) => {
    if (!isRecord(n) || !Array.isArray(n.kinds) || !n.kinds.every((k) => typeof k === "string")) {
      throw new Error(`An entry of ${key} isn't a neighbour.`);
    }
    return { path: str(n, "path"), kinds: n.kinds };
  });
}

export function readFileExample(inputs: unknown): FileExample {
  if (!isRecord(inputs) || !isRecord(inputs.facts)) throw new Error("Example inputs hold no facts.");
  const f = inputs.facts;
  if (typeof f.lines !== "number") throw new Error("Example field lines isn't a number.");
  if (f.role !== null && typeof f.role !== "string") throw new Error("Example field role isn't a string or null.");
  return {
    facts: {
      repo: str(f, "repo"),
      commit: str(f, "commit"),
      path: str(f, "path"),
      hash: str(f, "hash"),
      lines: f.lines,
      role: f.role,
      imports: neighbours(f.imports, "imports"),
      importedBy: neighbours(f.importedBy, "importedBy"),
    },
    source: str(inputs, "source"),
  };
}

/** A string field of a run's or example's outputs, or null when it has none. */
export function outputString(outputs: unknown, key: string): string | null {
  if (!isRecord(outputs)) return null;
  const v = outputs[key];
  return typeof v === "string" ? v : null;
}
