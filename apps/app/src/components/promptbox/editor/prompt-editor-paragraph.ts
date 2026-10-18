import { commands, type Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { promptEditorSerializationFromDoc } from "./prompt-editor-serialization";
import { dispatchPromptEditorTransaction } from "./prompt-editor-transaction";

interface SplitBlockEditorContext {
  extensionManager: {
    attributes: Editor["extensionManager"]["attributes"];
  };
}

export type PromptLineContinuation =
  | { kind: "continue"; prefix: string }
  | { kind: "end" };

export function parsePromptLineContinuation(
  value: unknown,
): PromptLineContinuation | null {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return null;
  }
  if (value.kind === "end") return { kind: "end" };
  if (
    value.kind === "continue" &&
    "prefix" in value &&
    typeof value.prefix === "string" &&
    !value.prefix.includes("\n")
  ) {
    return { kind: "continue", prefix: value.prefix };
  }
  return null;
}

export type PromptLineContinuationResolver = (
  textBeforeCaret: string,
) => PromptLineContinuation | null;

function caretLineStart(state: EditorState): number {
  const { $from } = state.selection;
  const paragraph = $from.parent;
  let lineStart = $from.start();
  paragraph.forEach((child, offset) => {
    if (offset < $from.parentOffset && child.type.name === "hardBreak") {
      lineStart = $from.start() + offset + child.nodeSize;
    }
  });
  return lineStart;
}

export function createPromptParagraphNewlineTransaction(args: {
  state: EditorState;
  editor: SplitBlockEditorContext;
  continueLine?: PromptLineContinuationResolver;
}): Transaction | null {
  const { selection } = args.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph") {
    return null;
  }

  let continuation: PromptLineContinuation | null = null;
  let lineStart = $from.pos;
  if (args.continueLine !== undefined) {
    lineStart = caretLineStart(args.state);
    const textBeforeCaret = promptEditorSerializationFromDoc(
      args.state.doc.cut(lineStart, $from.pos),
    ).text;
    continuation = args.continueLine(textBeforeCaret);
  }

  const transaction = args.state.tr;
  if (continuation?.kind === "end" && lineStart < $from.pos) {
    transaction.delete(lineStart, $from.pos);
    return transaction;
  }

  const didSplit = commands.splitBlock({ keepMarks: false })({
    state: args.state,
    tr: transaction,
    dispatch: () => {},
    editor: args.editor as Editor,
    commands: null as never,
    can: null as never,
    chain: null as never,
    view: null as never,
  });
  if (!didSplit || !transaction.docChanged) return null;

  if (continuation?.kind === "continue" && continuation.prefix.length > 0) {
    transaction.insertText(continuation.prefix);
  }
  return transaction;
}

export function applyPromptParagraphNewline(
  editor: Editor,
  continueLine?: PromptLineContinuationResolver,
): boolean {
  return dispatchPromptEditorTransaction(
    editor,
    createPromptParagraphNewlineTransaction({
      state: editor.state,
      editor,
      ...(continueLine !== undefined ? { continueLine } : {}),
    }),
  );
}
