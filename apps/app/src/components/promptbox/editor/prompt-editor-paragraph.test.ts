import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { promptEditorExtensions } from "./prompt-editor-extensions";
import { Node } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { promptEditorValueFromDoc } from "./prompt-editor-serialization";
import { createPromptParagraphNewlineTransaction } from "./prompt-editor-paragraph";

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

  it("starts the new line with a plugin's continuation prefix in one step", () => {
    const state = stateFromJson(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "intro" },
              { type: "hardBreak" },
              { type: "text", text: "- one" },
            ],
          },
        ],
      },
      12,
    );
    const seen: string[] = [];
    const transaction = createPromptParagraphNewlineTransaction({
      state,
      editor: editorContext,
      continueLine: (textBeforeCaret) => {
        seen.push(textBeforeCaret);
        return { kind: "continue", prefix: "- " };
      },
    });

    expect(seen).toEqual(["- one"]);
    const nextState = state.apply(transaction!);
    expect(promptEditorValueFromDoc(nextState.doc).text).toBe(
      "intro\n- one\n- ",
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
      continueLine: () => ({ kind: "end" }),
    });

    const nextState = state.apply(transaction!);
    expect(promptEditorValueFromDoc(nextState.doc).text).toBe("- one\n");
    expect(nextState.doc.childCount).toBe(2);
  });
});
