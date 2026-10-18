import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

export type CommentRange = { id: string; from: number; to: number };
export const commentHighlightKey = new PluginKey<DecorationSet>(
  "docs-comments",
);
export function visibleEditor(doc: Node): {
  text: string;
  positions: number[];
} {
  let text = "";
  const positions: number[] = [];
  function append(value: string, position: number, atomic = false) {
    text += value;
    for (let i = 0; i < value.length; i++)
      positions.push(position + (atomic ? 0 : i));
  }
  doc.descendants((node, position) => {
    if (node.isTextblock || (node.isBlock && node.isAtom)) {
      if (positions.length) append("\n\n", position, true);
      if (node.isAtom) {
        append("\ufffc", position, true);
        return false;
      }
    }
    if (node.isText) append(node.text ?? "", position);
    else if (node.type.name === "hardBreak") append("\n", position, true);
    else if (node.isInline && node.isAtom) append("\ufffc", position, true);
    return true;
  });
  return { text, positions };
}
export function commentRanges(
  doc: Node,
  decorations: DecorationSet,
): CommentRange[] {
  return decorations
    .find()
    .map((item) => ({ id: String(item.spec.id), from: item.from, to: item.to }))
    .filter(
      (item, i, ranges) =>
        ranges.findIndex((other) => other.id === item.id) === i,
    );
}
export function createCommentHighlights() {
  return Extension.create({
    name: "docsComments",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentHighlightKey,
          state: {
            init: () => DecorationSet.empty,
            apply(transaction, current) {
              const update:
                | { ranges: CommentRange[]; active: string | null }
                | undefined = transaction.getMeta(commentHighlightKey);
              if (update)
                return DecorationSet.create(
                  transaction.doc,
                  update.ranges
                    .filter(
                      (range) =>
                        range.from < range.to &&
                        range.to <= transaction.doc.content.size,
                    )
                    .map((range) =>
                      Decoration.inline(
                        range.from,
                        range.to,
                        {
                          class: "docs-comment-highlight",
                          "data-comment-id": range.id,
                          "data-active": String(range.id === update.active),
                        },
                        {
                          id: range.id,
                          inclusiveStart: false,
                          inclusiveEnd: false,
                        },
                      ),
                    ),
                );
              return current.map(transaction.mapping, transaction.doc);
            },
          },
          props: {
            decorations: (state) => commentHighlightKey.getState(state),
          },
        }),
      ];
    },
  });
}
