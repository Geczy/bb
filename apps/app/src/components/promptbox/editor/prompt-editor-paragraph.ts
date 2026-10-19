import { commands, type Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { promptEditorSerializationFromDoc } from "./prompt-editor-serialization";
import { dispatchPromptEditorTransaction } from "./prompt-editor-transaction";

interface SplitBlockEditorContext {
  extensionManager: {
    attributes: Editor["extensionManager"]["attributes"];
  };
}

type PromptListContinuation =
  | { kind: "continue"; prefix: string }
  | { kind: "end" };

const LIST_ITEM =
  /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/;

export function promptListContinuation(
  textBeforeCaret: string,
): PromptListContinuation | null {
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
}): Transaction | null {
  const { selection } = args.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph") {
    return null;
  }

  const lineStart = caretLineStart(args.state);
  const continuation = promptListContinuation(
    promptEditorSerializationFromDoc(args.state.doc.cut(lineStart, $from.pos))
      .text,
  );

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

export function applyPromptParagraphNewline(editor: Editor): boolean {
  return dispatchPromptEditorTransaction(
    editor,
    createPromptParagraphNewlineTransaction({ state: editor.state, editor }),
  );
}
