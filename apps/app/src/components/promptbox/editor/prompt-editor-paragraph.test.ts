import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { promptEditorExtensions } from "./prompt-editor-extensions";
import { Node } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { promptEditorValueFromDoc } from "./prompt-editor-serialization";
import {
  createPromptParagraphNewlineTransaction,
  promptListContinuation,
} from "./prompt-editor-paragraph";

const schema = getSchema(promptEditorExtensions({ getPlaceholder: () => "" }));

const editorContext = {
  extensionManager: { attributes: [] },
};

function stateFromJson(docJson: unknown, selectionPosition: number) {
  const doc = Node.fromJSON(schema, docJson);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, selectionPosition),
  });
}

describe("createPromptParagraphNewlineTransaction", () => {
  it("splits plain text at the caret while preserving Markdown delimiters", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "**bold** reply" }],
          },
        ],
      },
      9,
    );
    const transaction = createPromptParagraphNewlineTransaction({
      state,
      editor: editorContext,
    });
    expect(transaction).not.toBeNull();
    const nextState = state.apply(transaction!);
    expect(promptEditorValueFromDoc(nextState.doc)).toEqual({
      text: "**bold**\n reply",
      mentions: [],
    });
    expect(nextState.selection.from).toBe(11);
  });

  it("does not handle paragraphs inside blockquotes", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "quote" }],
              },
            ],
          },
        ],
      },
      7,
    );

    expect(
      createPromptParagraphNewlineTransaction({
        state,
        editor: editorContext,
      }),
    ).toBeNull();
  });

  it("continues a list item on a hard-break line", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "intro" },
              { type: "hardBreak" },
              { type: "text", text: "3. one" },
            ],
          },
        ],
      },
      13,
    );
    const transaction = createPromptParagraphNewlineTransaction({
      state,
      editor: editorContext,
    });

    const nextState = state.apply(transaction!);
    expect(promptEditorValueFromDoc(nextState.doc).text).toBe(
      "intro\n3. one\n4. ",
    );
    expect(nextState.selection.from).toBe(nextState.doc.content.size - 1);
  });

  it("clears an empty list marker instead of adding a line", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "- one" }] },
          { type: "paragraph", content: [{ type: "text", text: "- " }] },
        ],
      },
      10,
    );
    const transaction = createPromptParagraphNewlineTransaction({
      state,
      editor: editorContext,
    });

    const nextState = state.apply(transaction!);
    expect(promptEditorValueFromDoc(nextState.doc).text).toBe("- one\n");
    expect(nextState.doc.childCount).toBe(2);
  });
});

describe("createPromptParagraphNewlineTransaction list items", () => {
  it("keeps the item's text when Shift+Enter follows its marker", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "1. fix" }] },
        ],
      },
      4,
    );
    const transaction = createPromptParagraphNewlineTransaction({
      state,
      editor: editorContext,
    });

    expect(promptEditorValueFromDoc(state.apply(transaction!).doc).text).toBe(
      "1. \n2. fix",
    );
  });
});

describe("promptListContinuation", () => {
  it("pushes an item down instead of ending it when text follows the caret", () => {
    expect(promptListContinuation("- ", true)).toEqual({
      kind: "continue",
      prefix: "- ",
    });
  });

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
    { line: "1.5 apples", expected: null },
    { line: "@src/app.ts - item", expected: null },
  ])("$line", ({ line, expected }) => {
    expect(promptListContinuation(line, false)).toEqual(expected);
  });
});
