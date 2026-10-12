import { parseProse, type Inline } from "../lib/prose.ts";

// Whether an answer names only paths its model was shown. Set membership, so
// deterministic code with an exact answer: a model grading a model here would
// be a hallucination detector that can hallucinate.
//
// "Shown" is every token in the messages the model was handed, source
// included: an import specifier like `./client.ts` was in front of it, so
// repeating it invents nothing. Anything path-shaped in the answer that isn't
// one of those tokens was made up.

export const PATH_CHECK_KEY = "only-shown-paths";

export type PathCheck = {
  /** Every path-shaped token the answer names, sorted. */
  named: string[];
  /** The ones that appear nowhere in what the model was shown. */
  invented: string[];
};

// Path characters, including the parentheses and brackets of route folders
// like `app/(shop)/[id]/page.tsx`. Quotes, commas, backticks and spaces end a
// token.
const TOKEN = /[\w@$.\-[\]()+~/]+/g;

const EXTENSION =
  /\w\.(?:[cm]?[jt]sx?|json|mdx?|css|scss|sass|less|html|ya?ml|sql|svg|graphql|gql|vue|svelte|toml|txt|lock)$/i;

const count = (text: string, char: string) => text.split(char).length - 1;

/** Strips what a sentence put around a path: trailing punctuation, unbalanced brackets, a closing slash. */
function trim(token: string): string {
  let t = token;
  for (let changed = true; changed; ) {
    changed = false;
    const stripped = t.replace(/[.,;!?]+$/, "");
    if (stripped !== t) {
      t = stripped;
      changed = true;
    }
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
    ]) {
      if (t.endsWith(close) && count(t, close) > count(t, open)) {
        t = t.slice(0, -1);
        changed = true;
      }
      if (t.startsWith(open) && count(t, open) > count(t, close)) {
        t = t.slice(1);
        changed = true;
      }
    }
  }
  // `lib/map/` and `lib/map` name the same folder.
  return t.length > 1 ? t.replace(/\/+$/, "") : t;
}

function tokens(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => trim(m[0])).filter((t) => /\w/.test(t));
}

/**
 * Inside inline code, which is where the prompts put paths, a slash or a file
 * extension is enough. In running prose it takes both, so "read/write" and
 * "Next.js" are words, not paths.
 */
function pathShaped(token: string, inCode: boolean): boolean {
  const slash = token.includes("/");
  const extension = EXTENSION.test(token);
  return inCode ? slash || extension : slash && extension;
}

function collect(nodes: readonly Inline[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === "bold") {
      collect(node.children, into);
      continue;
    }
    for (const t of tokens(node.text)) if (pathShaped(t, node.kind === "code")) into.add(t);
  }
}

/**
 * The answer is read the way the pane reads it, so a path counts as named
 * exactly when the reader would see it.
 */
export function checkPaths(answer: string, shown: readonly string[]): PathCheck {
  const named = new Set<string>();
  for (const block of parseProse(answer)) {
    if (block.kind === "paragraph") collect(block.content, named);
    else for (const item of block.items) collect(item, named);
  }
  const seen = new Set(shown.flatMap(tokens));
  const sorted = [...named].sort();
  return { named: sorted, invented: sorted.filter((t) => !seen.has(t)) };
}

/** 1 when every path named was shown, 0 when any was invented. */
export function pathScore(check: PathCheck): 0 | 1 {
  return check.invented.length === 0 ? 1 : 0;
}

export function pathComment(check: PathCheck): string {
  if (check.invented.length > 0) return `Invented: ${check.invented.join(", ")}`;
  return check.named.length === 0 ? "Names no paths." : `All ${check.named.length} named paths were shown.`;
}
