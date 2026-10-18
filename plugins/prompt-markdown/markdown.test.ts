import { describe, expect, it } from "vitest";
import type { ComposerDraft } from "@get-bb/plugin-sdk/app";
import {
  continueMarkdownLine,
  parseMarkdownRanges,
  type MarkdownRangeKind,
} from "./markdown.js";

function draft(text: string, mentions: ComposerDraft["mentions"] = []) {
  return { text, mentions } satisfies ComposerDraft;
}

function texts(text: string, kind: MarkdownRangeKind, value = draft(text)) {
  return parseMarkdownRanges(value)[kind].map(({ from, to }) =>
    text.slice(from, to),
  );
}

function pill(text: string, label: string): ComposerDraft["mentions"][number] {
  const from = text.indexOf(label);
  return {
    from,
    to: from + label.length,
    label,
    kind: "path",
    path: label.slice(1),
    source: "workspace",
    entryKind: "file",
  };
}

describe("parseMarkdownRanges", () => {
  it("styles headings and hides their markers", () => {
    const text = "# Title\n### Small\n#### Smaller\n#hashtag";
    expect(texts(text, "h1")).toEqual(["Title"]);
    expect(texts(text, "h3")).toEqual(["Small", "Smaller"]);
    expect(texts(text, "marker")).toEqual(["# ", "### ", "#### "]);
  });

  it("marks bullets, keeps nested indentation, and keeps typed numbers", () => {
    const text = "- a\n  * b\n1. one\n1. again\n3) three\n-not a list";
    expect(texts(text, "bullet")).toEqual(["- ", "* "]);
    expect(texts(text, "ordered")).toEqual(["1.", "1.", "3)"]);
  });

  it("hides inline delimiters around bold, italic, and code", () => {
    const text = "**bold** and __also__, *it* and _em_, `co*de*`";
    expect(texts(text, "strong")).toEqual(["bold", "also"]);
    expect(texts(text, "em")).toEqual(["it", "em"]);
    expect(texts(text, "code")).toEqual(["co*de*"]);
    expect(texts(text, "marker")).toEqual([
      "`",
      "`",
      "**",
      "**",
      "__",
      "__",
      "*",
      "*",
      "_",
      "_",
    ]);
  });

  it("leaves snake_case words and unmatched delimiters alone", () => {
    const text = "call snake_case_name or 2 * 3 * 4 or **open";
    expect(texts(text, "em")).toEqual([]);
    expect(texts(text, "strong")).toEqual([]);
    expect(texts(text, "marker")).toEqual([]);
  });

  it("never pairs delimiters inside or across mention pills", () => {
    const text = "_see @src/__init__.py now_ and **@a_b.ts**";
    const value = draft(text, [
      pill(text, "@src/__init__.py"),
      pill(text, "@a_b.ts"),
    ]);
    const ranges = parseMarkdownRanges(value);
    for (const kind of Object.keys(ranges) as MarkdownRangeKind[]) {
      for (const range of ranges[kind]) {
        for (const mention of value.mentions) {
          expect(range.from < mention.to && range.to > mention.from).toBe(
            false,
          );
        }
      }
    }
    expect(texts(text, "em", value)).toEqual([]);
  });

  it("formats quoted lines and skips fenced code", () => {
    const text = "> **quoted**\n```\n# not a heading\n```\n# heading";
    expect(texts(text, "strong")).toEqual(["quoted"]);
    expect(texts(text, "h1")).toEqual(["heading"]);
  });
});

describe("continueMarkdownLine", () => {
  it.each([
    { line: "- item", expected: { kind: "continue", prefix: "- " } },
    { line: "  * nested", expected: { kind: "continue", prefix: "  * " } },
    { line: "3. third", expected: { kind: "continue", prefix: "4. " } },
    { line: "9) ninth", expected: { kind: "continue", prefix: "10) " } },
    { line: "- [x] done", expected: { kind: "continue", prefix: "- [ ] " } },
    { line: "- ", expected: { kind: "end" } },
    { line: "  1.  ", expected: { kind: "end" } },
    { line: "- [ ] ", expected: { kind: "end" } },
    { line: "plain text", expected: null },
    { line: "-dash", expected: null },
    { line: "@src/app.ts - item", expected: null },
  ])("$line", ({ line, expected }) => {
    expect(continueMarkdownLine(line)).toEqual(expected);
  });
});
