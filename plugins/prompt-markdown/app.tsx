import { definePluginApp, type ComposerDraft } from "@get-bb/plugin-sdk/app";
import "./app.css";
import {
  continueMarkdownLine,
  markdownRanges,
  type MarkdownRangeKind,
} from "./markdown.js";

const STYLED_KINDS: readonly MarkdownRangeKind[] = [
  "ordered",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "code",
];
const OFF_CARET_LINE_KINDS: readonly MarkdownRangeKind[] = ["marker", "bullet"];

function effect(kind: MarkdownRangeKind, offCaretLineOnly: boolean) {
  return {
    id: kind,
    className: `bb-prompt-md-${kind}`,
    ...(offCaretLineOnly ? { experimental_offCaretLineOnly: true } : {}),
    experimental_matchDraft: (draft: ComposerDraft) =>
      markdownRanges(draft)[kind],
  };
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "markdown",
    richText: {
      effects: [
        ...STYLED_KINDS.map((kind) => effect(kind, false)),
        ...OFF_CARET_LINE_KINDS.map((kind) => effect(kind, true)),
      ],
      experimental_continueLine: continueMarkdownLine,
    },
  });
});
