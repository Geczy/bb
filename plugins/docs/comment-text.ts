import MarkdownIt from "markdown-it";
import { parseMarkdownDocument } from "./markdown-document.js";
import { HTML_EMBED_BLOCK, renderedTags } from "./html-tags.js";
import type { VisibleDocument } from "./comments.js";

const parser = new MarkdownIt({ html: true, linkify: true });
export function visibleMarkdown(content: string): VisibleDocument {
  const { body, frontmatter } = parseMarkdownDocument(content);
  const offset = (frontmatter.match(/\n/g) ?? []).length;
  const blocks: { text: string; line: number }[] = [];
  let sourceLine = 0;
  let listItems = 0;
  let itemStart = false;
  for (const token of parser.parse(body, {})) {
    if (token.map) sourceLine = token.map[0];
    const line = offset + sourceLine + 1;
    if (token.type === "list_item_open") {
      listItems++;
      itemStart = true;
      continue;
    }
    if (token.type === "list_item_close") listItems--;
    if (token.type === "inline") {
      const children = token.children ?? [];
      const rendered = renderedTags(children);
      let text = "";
      children.forEach((child, position) => {
        if (["text", "code_inline"].includes(child.type)) text += child.content;
        else if (child.type === "image") text += "\ufffc";
        else if (child.type === "softbreak") text += " ";
        else if (child.type === "hardbreak") text += "\n";
        else if (child.type === "html_inline")
          text += rendered.has(position)
            ? /^<br/i.test(child.content)
              ? "\n"
              : ""
            : child.content;
      });
      if (listItems && itemStart) text = text.replace(/^\[[ xX]\] /, "");
      itemStart = false;
      if (/^::html\{/.test(text)) text = "\ufffc";
      blocks.push({ text, line });
    } else if (token.type === "fence" || token.type === "code_block") {
      blocks.push({
        text: token.content.replace(/\n$/, ""),
        line: line + (token.type === "fence" ? 1 : 0),
      });
    } else if (token.type === "html_block") {
      blocks.push({
        text: HTML_EMBED_BLOCK.test(token.content)
          ? "\ufffc"
          : token.content.replace(/\n$/, ""),
        line,
      });
      itemStart = false;
    } else if (token.type === "hr") blocks.push({ text: "\ufffc", line });
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
