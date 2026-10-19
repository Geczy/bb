import MarkdownIt from "markdown-it";
import { parseMarkdownDocument } from "./markdown-document.js";
import { HTML_EMBED_BLOCK, renderedTags } from "./html-tags.js";
import type { VisibleDocument } from "./comments.js";

const parser = new MarkdownIt({ html: true, linkify: true });
export function visibleMarkdown(content: string): VisibleDocument {
  const { body, frontmatter } = parseMarkdownDocument(content);
  const offset = (frontmatter.match(/\n/g) ?? []).length;
  const blocks: { text: string; line: number; lines?: number[] }[] = [];
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
      const lines: number[] = [];
      let current = line;
      const add = (value: string) => {
        for (const character of value) {
          text += character;
          for (let unit = 0; unit < character.length; unit++)
            lines.push(current);
          if (character === "\n") current++;
        }
      };
      children.forEach((child, position) => {
        if (["text", "code_inline"].includes(child.type)) add(child.content);
        else if (child.type === "image") add("\ufffc");
        else if (child.type === "softbreak") {
          add(" ");
          current++;
        } else if (child.type === "hardbreak") add("\n");
        else if (child.type === "html_inline")
          add(
            rendered.has(position)
              ? /^<br/i.test(child.content)
                ? "\n"
                : ""
              : child.content,
          );
      });
      if (listItems && itemStart && /^\[[ xX]\] /.test(text)) {
        text = text.slice(4);
        lines.splice(0, 4);
      }
      itemStart = false;
      if (/^::html\{/.test(text)) blocks.push({ text: "\ufffc", line });
      else blocks.push({ text, line, lines });
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
    if (block.lines) lines.push(...block.lines);
    else {
      let line = block.line;
      for (let i = 0; i < block.text.length; i++) {
        lines.push(line);
        if (block.text[i] === "\n") line++;
      }
    }
  });
  return { text, lines };
}
