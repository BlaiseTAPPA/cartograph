import OpenAI from "openai";
import { isTracingEnabled } from "langsmith";
import { wrapOpenAI } from "langsmith/wrappers/openai";
import { env } from "../lib/env.ts";

// The only place in the codebase that constructs the model client. Wrapped, so
// every call through it is a traced LLM run with its token counts. A client
// built anywhere else would work and silently go untraced.

/**
 * Exact snapshots, never a moving alias: an alias changes underneath a cache
 * keyed on it. The name is part of every cache key, so re-pinning one task
 * misses only that task's entries.
 */
export const MODELS = {
  explain: "gpt-5.4-mini-2026-03-17",
  classify: "gpt-5.4-mini-2026-03-17",
} as const;

export const ai = wrapOpenAI(new OpenAI({ apiKey: env.openaiApiKey }));

export type Tracing = { on: true } | { on: false; why: string };

/**
 * Whether runs reach LangSmith. Calls succeed either way, so an absent key
 * would otherwise look exactly like a working setup with no traffic.
 */
export function tracing(): Tracing {
  if (!isTracingEnabled()) return { on: false, why: "LANGSMITH_TRACING is not true" };
  if (!process.env.LANGSMITH_API_KEY?.trim()) return { on: false, why: "LANGSMITH_API_KEY is unset" };
  return { on: true };
}

const state = tracing();
if (!state.on) console.warn(`Model calls are not traced: ${state.why}.`);
