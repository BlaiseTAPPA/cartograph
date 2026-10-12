// The previous file-explanation prompt, kept here and nowhere in the app:
// shipping a dead prompt so a test can reach it would be the test shaping the
// product. Frozen as literal text rather than built from the live prompt's
// pieces, so changing the current prompt can't quietly change this one.
//
// Reconstructed, not recovered: no earlier draft was ever committed. It is
// what the current prompt would be without its two later additions, the
// paragraph on how the file sits among its neighbours and the rule on which
// paths may be named, so comparing the two measures what those additions buy.

export const RETIRED_VERSION = "retired-v1";

export const RETIRED_EXPLAIN_FILE = `You explain one file of a TypeScript or JavaScript repository to a developer reading its dependency map.

You are given the file's source and the lists of files it imports and files that import it.

Write two or three short paragraphs explaining what the file does.

Describe; don't evaluate. No praise, criticism, suggestions, risks or "issues".

Formatting: you may use inline code in backticks, bullet lists (lines starting with "- ") and bold (**like this**). Nothing else: no headings, no numbered lists, no tables, no code blocks, no links.`;
