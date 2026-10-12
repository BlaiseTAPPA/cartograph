import { createHash } from "node:crypto";
import { traceable } from "langsmith/traceable";

export type Task = "explain-file" | "explain-folder" | "classify";

/** Where answers are kept. The caller decides how; this module knows no database. */
export type AnswerCache = {
  read(key: string): Promise<string | null>;
  write(entry: { key: string; task: Task; model: string; body: string }): Promise<void>;
};

export type Answer = { body: string; cached: boolean };

/**
 * A sha256 over the model name and the exact prompt it would be handed, with
 * any source text stood in for by its hash. Changing the model, the prompt's
 * wording or anything the model sees misses the cache; nothing else does.
 */
export function cacheKey(model: string, system: string, user: string): string {
  return createHash("sha256").update(JSON.stringify([model, system, user])).digest("hex");
}

/**
 * One traced run per question. The cache is read inside it, so a hit is a
 * recorded run with a cache read and no model call under it, and a miss shows
 * the model call with its tokens. A cache read outside the trace would make a
 * hit invisible, and a broken cache indistinguishable from a working one.
 */
export async function throughCache(
  run: { name: string; task: Task; model: string; key: string; subject: string },
  cache: AnswerCache,
  ask: () => Promise<string>,
): Promise<Answer> {
  // A run of its own under the call, so the trace shows the lookup happened
  // and what it found.
  const readCache = traceable(
    async (key: string): Promise<{ hit: boolean; body: string | null }> => {
      const body = await cache.read(key);
      return { hit: body !== null, body };
    },
    { name: "cache read", run_type: "retriever" },
  );
  const traced = traceable(
    async (input: { subject: string; key: string; model: string }): Promise<Answer> => {
      const { body: hit } = await readCache(input.key);
      if (hit !== null) return { body: hit, cached: true };
      const body = await ask();
      await cache.write({ key: run.key, task: run.task, model: run.model, body });
      return { body, cached: false };
    },
    { name: run.name, run_type: "chain", metadata: { task: run.task, model: run.model } },
  );
  return traced({ subject: run.subject, key: run.key, model: run.model });
}
