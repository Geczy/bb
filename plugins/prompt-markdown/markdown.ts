import type { ComposerDraft } from "@get-bb/plugin-sdk/app";

export interface TextRange {
  from: number;
  to: number;
}

export type MarkdownRangeKind =
  | "marker"
  | "bullet"
  | "ordered"
  | "h1"
  | "h2"
  | "h3"
  | "strong"
  | "em"
  | "code";

export type MarkdownRanges = Record<MarkdownRangeKind, TextRange[]>;

type LineContinuation = { kind: "continue"; prefix: string } | { kind: "end" };

const HEADING = /^(#{1,6})[ \t]+(?=\S)/;
const BULLET = /^([ \t]*)([-*+])([ \t]+)(?=\S)/;
const ORDERED = /^([ \t]*)(\d{1,9})([.)])([ \t]+)(?=\S)/;
const QUOTE = /^> ?/;
const CODE_SPAN = /`([^`\n]+)`/g;
const INLINE_RULES: readonly {
  kind: "strong" | "em";
  delimiter: number;
  pattern: RegExp;
}[] = [
  {
    kind: "strong",
    delimiter: 2,
    pattern: /(?<![*\\])\*\*(?=[^\s*])([^\n]*?[^\s\\])\*\*(?!\*)/g,
  },
  {
    kind: "strong",
    delimiter: 2,
    pattern: /(?<![_\w\\])__(?=[^\s_])([^\n]*?[^\s\\])__(?![_\w])/g,
  },
  {
    kind: "em",
    delimiter: 1,
    pattern: /(?<![*\\])\*(?=[^\s*])([^*\n]*?[^\s*\\])\*(?!\*)/g,
  },
  {
    kind: "em",
    delimiter: 1,
    pattern: /(?<![_\w\\])_(?=[^\s_])([^_\n]*?[^\s_\\])_(?![_\w])/g,
  },
];

function emptyRanges(): MarkdownRanges {
  return {
    marker: [],
    bullet: [],
    ordered: [],
    h1: [],
    h2: [],
    h3: [],
    strong: [],
    em: [],
    code: [],
  };
}

function overlaps(range: TextRange, blocked: readonly TextRange[]): boolean {
  return blocked.some(
    (block) => range.from < block.to && range.to > block.from,
  );
}

function maskRanges(text: string, ranges: readonly TextRange[]): string {
  let masked = text;
  for (const range of ranges) {
    masked =
      masked.slice(0, range.from) +
      "\u0000".repeat(range.to - range.from) +
      masked.slice(range.to);
  }
  return masked;
}

function parseInline(
  line: string,
  lineStart: number,
  pills: readonly TextRange[],
  ranges: MarkdownRanges,
): void {
  const blocked = [...pills];
  const masked = maskRanges(
    line,
    pills.map((pill) => ({
      from: Math.max(0, pill.from - lineStart),
      to: Math.min(line.length, pill.to - lineStart),
    })),
  );

  for (const match of masked.matchAll(CODE_SPAN)) {
    const from = lineStart + match.index;
    const to = from + match[0].length;
    if (overlaps({ from, to }, blocked)) continue;
    ranges.marker.push({ from, to: from + 1 }, { from: to - 1, to });
    ranges.code.push({ from: from + 1, to: to - 1 });
    blocked.push({ from, to });
  }

  for (const rule of INLINE_RULES) {
    for (const match of masked.matchAll(rule.pattern)) {
      const from = lineStart + match.index;
      const to = from + match[0].length;
      const content = { from: from + rule.delimiter, to: to - rule.delimiter };
      if (overlaps({ from, to }, blocked)) continue;
      ranges.marker.push({ from, to: content.from }, { from: content.to, to });
      ranges[rule.kind].push(content);
    }
  }
}

function parseLine(
  line: string,
  lineStart: number,
  pills: readonly TextRange[],
  ranges: MarkdownRanges,
): void {
  const quote = QUOTE.exec(line);
  const bodyOffset = quote === null ? 0 : quote[0].length;
  const body = line.slice(bodyOffset);
  const bodyStart = lineStart + bodyOffset;

  let contentOffset = 0;
  const heading = HEADING.exec(body);
  const bullet = heading === null ? BULLET.exec(body) : null;
  const ordered =
    heading === null && bullet === null ? ORDERED.exec(body) : null;
  if (heading !== null) {
    contentOffset = heading[0].length;
    ranges.marker.push({ from: bodyStart, to: bodyStart + contentOffset });
    const level = Math.min(heading[1]!.length, 3);
    ranges[`h${level}` as "h1" | "h2" | "h3"].push({
      from: bodyStart + contentOffset,
      to: lineStart + line.length,
    });
  } else if (bullet !== null) {
    contentOffset = bullet[0].length;
    ranges.bullet.push({
      from: bodyStart + bullet[1]!.length,
      to: bodyStart + contentOffset,
    });
  } else if (ordered !== null) {
    contentOffset = ordered[0].length;
    const markerStart = bodyStart + ordered[1]!.length;
    ranges.ordered.push({
      from: markerStart,
      to: markerStart + ordered[2]!.length + ordered[3]!.length,
    });
  }

  parseInline(
    body.slice(contentOffset),
    bodyStart + contentOffset,
    pills,
    ranges,
  );
}

export function parseMarkdownRanges(draft: ComposerDraft): MarkdownRanges {
  const ranges = emptyRanges();
  const pills = draft.mentions.map(({ from, to }) => ({ from, to }));
  let lineStart = 0;
  let inFence = false;
  for (const line of draft.text.split("\n")) {
    const lineEnd = lineStart + line.length;
    if (/^[ \t]*```/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const linePills = pills.filter(
        (pill) => pill.from < lineEnd && pill.to > lineStart,
      );
      parseLine(line, lineStart, linePills, ranges);
    }
    lineStart = lineEnd + 1;
  }
  for (const kind of Object.keys(ranges) as MarkdownRangeKind[]) {
    ranges[kind] = ranges[kind].filter((range) => !overlaps(range, pills));
  }
  return ranges;
}

let cachedDraft: ComposerDraft | null = null;
let cachedRanges: MarkdownRanges = emptyRanges();

export function markdownRanges(draft: ComposerDraft): MarkdownRanges {
  if (
    cachedDraft === null ||
    cachedDraft.text !== draft.text ||
    cachedDraft.mentions.length !== draft.mentions.length ||
    cachedDraft.mentions.some(
      (mention, index) =>
        mention.from !== draft.mentions[index]!.from ||
        mention.to !== draft.mentions[index]!.to,
    )
  ) {
    cachedDraft = draft;
    cachedRanges = parseMarkdownRanges(draft);
  }
  return cachedRanges;
}

const LIST_ITEM =
  /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/;

export function continueMarkdownLine(
  textBeforeCaret: string,
): LineContinuation | null {
  const item = LIST_ITEM.exec(textBeforeCaret);
  if (item === null) return null;
  const [, indent, bullet, number, delimiter, spacing, task, content] = item;
  if (content!.trim().length === 0) return { kind: "end" };
  const marker =
    bullet !== undefined ? bullet : `${Number(number) + 1}${delimiter}`;
  return {
    kind: "continue",
    prefix: `${indent}${marker}${spacing}${task === undefined ? "" : "[ ] "}`,
  };
}
