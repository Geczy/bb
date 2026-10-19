// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { afterEach, describe, expect, it } from "vitest";
import { threadRanges, visibleEditor } from "./comment-editor.js";
import { visibleMarkdown } from "./comment-text.js";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("visible comment text", () => {
  it("projects Markdown and the editor identically across horizontal rules", () => {
    const markdown =
      "# Plan\n\nIntro text.\n\n---\n\nAfter the dashed rule.\n\n***\n\nAfter the starred rule.";
    editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: markdown,
    });
    const stored = visibleMarkdown(markdown);
    const rendered = visibleEditor(editor.state.doc);
    expect(stored.text).toBe(rendered.text);
    for (const quote of ["After the dashed rule", "After the starred rule"]) {
      const start = stored.text.indexOf(quote);
      const end = start + quote.length;
      expect(
        editor.state.doc.textBetween(
          rendered.positions[start]!,
          rendered.positions[end - 1]! + 1,
        ),
      ).toBe(quote);
    }
    expect(stored.lines[stored.text.indexOf("After the starred")]).toBe(11);
  });
  it("places saved-text comments on the matching proposal draft text", () => {
    const saved = "# Plan\n\nShip on November 12.";
    const proposal =
      "# Plan\n\nA new paragraph from the proposal.\n\nShip on November 12.";
    editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: proposal,
    });
    const start = visibleMarkdown(saved).text.indexOf("November 12");
    const thread = {
      id: "c_1",
      status: "open" as const,
      resolvedAt: null,
      resolvedBy: null,
      messages: [
        {
          id: "c_1",
          author: { kind: "user" as const, name: "You" },
          body: "Still right?",
          createdAt: "2026-10-19T00:00:00.000Z",
          editedAt: null,
          sentTo: [],
        },
      ],
      anchor: {
        state: "anchored" as const,
        quote: "November 12",
        start,
        end: start + 11,
        line: 3,
      },
    };
    const doc = editor.state.doc;
    const highlighted = (base: string | null) =>
      threadRanges(doc, [thread], base).map((range) =>
        doc.textBetween(range.from, range.to),
      );
    expect(highlighted(null)).not.toEqual(["November 12"]);
    expect(highlighted(saved)).toEqual(["November 12"]);
    expect(
      threadRanges(doc, [thread], "# Plan\n\nShip on December 30."),
    ).toEqual([]);
  });
  it("re-finds stale saved offsets by quote and never highlights another sentence", () => {
    const original =
      "# Plan\n\nIntro.\n\n---\n\nAfter dash rule target sentence.\n\n***\n\nAfter star rule target sentence.";
    const edited = original
      .replace("Intro.", "Intro.\n\nInserted externally.")
      .replace("After star rule target sentence.", "Totally different words.");
    editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: edited,
    });
    const before = visibleMarkdown(original).text;
    const listed = (id: string, quote: string) => {
      const start = before.indexOf(quote);
      return {
        id,
        status: "open" as const,
        resolvedAt: null,
        resolvedBy: null,
        messages: [
          {
            id,
            author: { kind: "user" as const, name: "You" },
            body: id,
            createdAt: "2026-10-19T00:00:00.000Z",
            editedAt: null,
            sentTo: [],
          },
        ],
        anchor: {
          state: "anchored" as const,
          quote,
          start,
          end: start + quote.length,
          line: 1,
        },
      };
    };
    const doc = editor.state.doc;
    expect(
      threadRanges(
        doc,
        [
          listed("dash", "After dash rule target sentence."),
          listed("star", "After star rule target sentence."),
        ],
        null,
      ).map((range) => [range.id, doc.textBetween(range.from, range.to)]),
    ).toEqual([["dash", "After dash rule target sentence."]]);
  });
});
