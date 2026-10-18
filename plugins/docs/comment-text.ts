import MarkdownIt from "markdown-it";
import { parseMarkdownDocument } from "./markdown-document.js";
import type { VisibleDocument } from "./comments.js";

const parser = new MarkdownIt({ html: true, linkify: true });
export function visibleMarkdown(content: string): VisibleDocument {
  const { body, frontmatter } = parseMarkdownDocument(content);
  const offset = (frontmatter.match(/\n/g) ?? []).length;
  const blocks: { text: string; line: number }[] = [];
  for (const token of parser.parse(body, {})) {
    const line = offset + (token.map?.[0] ?? 0) + 1;
    if (token.type === "inline") {
      let text = "";
      for (const child of token.children ?? []) {
        if (["text", "code_inline"].includes(child.type)) text += child.content;
        else if (child.type === "image") text += "\ufffc";
        else if (["softbreak", "hardbreak"].includes(child.type)) text += "\n";
        else if (child.type === "html_inline") {
          if (/^<br\s*\/?>$/i.test(child.content)) text += "\n";
          else if (
            !/^<\/?(?:a|b|code|del|em|i|s|strike|strong)(?:\s[^>]*?)?>$/i.test(
              child.content,
            )
          )
            text += child.content;
        }
      }
      text = text.replace(/^\[[ xX]\] /, "");
      if (/^::html\{/.test(text)) text = "\ufffc";
      blocks.push({ text, line });
    } else if (token.type === "fence" || token.type === "code_block") {
      blocks.push({
        text: token.content.replace(/\n$/, ""),
        line: line + (token.type === "fence" ? 1 : 0),
      });
    } else if (token.type === "html_block")
      blocks.push({ text: "\ufffc", line });
  }
  let text = "";
  const lines: number[] = [];
  blocks.forEach((block, index) => {
    if (index) {
      text += "\n\n";
      lines.push(block.line, block.line);
    }
    text += block.text;
    let line = block.line;
    for (let i = 0; i < block.text.length; i++) {
      lines.push(line);
      if (block.text[i] === "\n") line++;
    }
  });
  return { text, lines };
}
