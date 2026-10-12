import { ai } from "../ai/client.ts";

// A model judging a model, which is the weak point of the prompt comparison
// and is said wherever its number is printed. "Specific enough to be useful"
// has no exact answer, so nothing deterministic can stand in for it. A
// different and larger model than the one judged, pinned exactly, so the
// judge doesn't favour its own phrasing and doesn't drift between runs.
//
// Not cached: the judge exists only in evals, where every call is meant to be
// fresh.

export const JUDGE_MODEL = "gpt-5.5-2026-04-23";
export const SPECIFICITY_KEY = "specificity-judged";

const JUDGE = `You judge one explanation of a source file, written for a developer reading the repository's dependency map. You are shown exactly what the writer was shown — the file's source and its complete lists of neighbours — and then the explanation.

Judge one thing: is it specific enough to be useful? A useful explanation could only be about this file. It names the exports and says what they do, what the file takes from the files it imports, and what the files importing it use it for. A useless one is generic: it would read much the same for many files, restates the file name, or lists neighbours without saying what passes between them.

Don't judge the code, and don't reward length: a short specific answer beats a long vague one.

5: every sentence is specific to this file and its listed neighbours.
4: mostly specific, with a sentence or two that could describe any file.
3: a mix of specific and generic.
2: mostly generic, with a few concrete names.
1: generic throughout.

Give your reason in one sentence, then the score.`;

const SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string" },
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
  },
  required: ["reason", "score"],
  additionalProperties: false,
} as const;

export type Judgement = { score: number; reason: string };

export async function judgeSpecificity(shownMessage: string, answer: string): Promise<Judgement> {
  const response = await ai.chat.completions.create({
    model: JUDGE_MODEL,
    reasoning_effort: "low",
    messages: [
      { role: "developer", content: JUDGE },
      { role: "user", content: `${shownMessage}\n\nThe explanation:\n<explanation>\n${answer}\n</explanation>` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "judgement", strict: true, schema: SCHEMA } },
  });
  const parsed: unknown = JSON.parse(response.choices[0]?.message.content ?? "null");
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("score" in parsed) ||
    !("reason" in parsed) ||
    typeof parsed.score !== "number" ||
    typeof parsed.reason !== "string" ||
    ![1, 2, 3, 4, 5].includes(parsed.score)
  ) {
    throw new Error(`${JUDGE_MODEL} answered outside the schema: ${JSON.stringify(parsed)}`);
  }
  return { score: parsed.score, reason: parsed.reason };
}
