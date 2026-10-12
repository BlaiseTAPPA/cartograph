// The three formats the prompts permit (inline code, bullets, bold), read
// into structure. Anything else a model writes anyway is reduced to its text:
// a heading becomes a bold line, a numbered item a bullet, italics plain
// words, a fence its contents. No marker is ever left on screen as a
// character. Pure, so what the pane draws is decided here and nowhere else.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; children: Inline[] };

export type Block = { kind: "paragraph"; content: Inline[] } | { kind: "list"; items: Inline[][] };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)[\s#]*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?/;

export function parseProse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let fence: string[] | null = null;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
    if (items.length > 0) blocks.push({ kind: "list", items: items.map(parseInline) });
    paragraph = [];
    items = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(raw)) {
      if (fence === null) {
        flush();
        fence = [];
      } else {
        // A fence's contents, as code, without the fence.
        if (fence.length > 0) blocks.push({ kind: "paragraph", content: [{ kind: "code", text: fence.join("\n") }] });
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      fence.push(raw);
      continue;
    }

    const line = raw.replace(QUOTE, "");
    if (line.trim() === "" || RULE.test(line)) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "paragraph", content: [{ kind: "bold", children: parseInline(heading[1]) }] });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      if (paragraph.length > 0) flush();
      items.push(item[1]);
      continue;
    }
    // An indented line under a bullet continues it; anything else starts prose.
    if (items.length > 0 && /^\s/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (items.length > 0) flush();
    paragraph.push(line.trim());
  }
  if (fence !== null && fence.length > 0) blocks.push({ kind: "paragraph", content: [{ kind: "code", text: fence.join("\n") }] });
  flush();
  return blocks;
}

const WORD = /[\p{L}\p{N}]/u;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const push = (node: Inline) => {
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
    out.push(node);
  };

  for (let i = 0; i < text.length; ) {
    const c = text[i];

    if (c === "\\" && i + 1 < text.length && /[\\`*_[\]#]/.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      const close = text.indexOf(ticks, i + run);
      if (close !== -1) {
        push({ kind: "code", text: text.slice(i + run, close).trim() });
        i = close + run;
      } else {
        // An unmatched backtick is a marker, not text.
        i += run;
      }
      continue;
    }

    if ((c === "*" || c === "_") && text[i + 1] === c) {
      const marker = c + c;
      const close = text.indexOf(marker, i + 2);
      if (close !== -1 && close > i + 2) {
        push({ kind: "bold", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
      } else {
        i += 2;
      }
      continue;
    }

    if (c === "*") {
      // Italics aren't permitted, so their words are kept as plain text.
      const close = text.indexOf("*", i + 1);
      if (close !== -1 && close > i + 1) {
        for (const node of parseInline(text.slice(i + 1, close))) {
          if (node.kind === "text") plain += node.text;
          else push(node);
        }
        i = close + 1;
      } else {
        i += 1;
      }
      continue;
    }

    // Underscores sit inside identifiers, so only a word-boundary pair is italics.
    if (c === "_" && !WORD.test(text[i - 1] ?? "")) {
      const close = text.indexOf("_", i + 1);
      if (close !== -1 && close > i + 1 && !WORD.test(text[close + 1] ?? "")) {
        plain += text.slice(i + 1, close);
        i = close + 1;
        continue;
      }
    }

    if (c === "[") {
      // A link keeps its words.
      const link = /^\[([^\]]+)\]\([^)]*\)/.exec(text.slice(i));
      if (link) {
        for (const node of parseInline(link[1])) {
          if (node.kind === "text") plain += node.text;
          else push(node);
        }
        i += link[0].length;
        continue;
      }
    }

    plain += c;
    i += 1;
  }
  if (plain) out.push({ kind: "text", text: plain });
  return out;
}

export type PathRef = { kind: "file" | "folder"; path: string };

/** A piece of prose: plain words, or a repository path that can move the map. */
export type Segment = { text: string } | { text: string; ref: PathRef };

// Something shaped like a path: segments of path characters joined by
// slashes, or a single name with an extension. Whether it is one is decided
// by the lookup, never by the shape.
const CANDIDATE = /(?:\.\/)?[\w@$.\-[\]()+~]+(?:\/[\w@$.\-[\]()+~]+)*\/?/g;

/** Text with every token that names a real repository path made a reference. */
export function linkPaths(text: string, lookup: (candidate: string) => PathRef | null): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const found = resolveToken(match[0], lookup);
    if (!found) continue;
    const start = match.index + found.offset;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: found.text, ref: found.ref });
    last = start + found.text.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Trims punctuation the sentence put around a path until it names one, or gives up. */
function resolveToken(token: string, lookup: (candidate: string) => PathRef | null) {
  let offset = 0;
  let text = token;
  while (/^[(\[]/.test(text)) {
    text = text.slice(1);
    offset++;
  }
  for (;;) {
    if (text === "") return null;
    const ref = lookup(text);
    if (ref) return { offset, text, ref };
    if (!/[.,:;!?)\]]$/.test(text)) return null;
    text = text.slice(0, -1);
  }
}
