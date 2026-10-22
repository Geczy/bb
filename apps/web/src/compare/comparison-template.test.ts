import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COMPARISONS } from "./comparisons";
import { ComparePage, withPluginsSlot } from "./compare-page";
import { PLUGINS_COPY } from "./compare-sections";

const pagesDirectory = fileURLToPath(new URL("./pages/", import.meta.url));

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h([12])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g)].map(
    (match) => text(match[2]),
  );
}

describe("comparison template", () => {
  it("registers one comparison per page module", () => {
    const pages = readdirSync(pagesDirectory).filter(
      (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
    );
    expect(COMPARISONS).toHaveLength(pages.length);
    expect(new Set(COMPARISONS.map((c) => c.slug)).size).toBe(pages.length);
  });

  it.each(COMPARISONS)(
    "$slug renders the shared section order",
    (comparison) => {
      const html = renderToStaticMarkup(
        createElement(ComparePage, { comparison }),
      );
      const [lead, ...rest] = withPluginsSlot(
        comparison.heroVisual,
        [comparison.tailored, ...comparison.sections],
        PLUGINS_COPY,
      );
      const expected = [
        comparison.headline,
        lead.title,
        `bbvs${comparison.competitor.name}`,
        ...rest.map((section) => section.title),
        comparison.faqTitle,
        comparison.closer.title,
      ].map(text);
      expect(headings(html).slice(0, expected.length)).toEqual(expected);
    },
  );

  it.each(COMPARISONS)("$slug has no repeated section", (comparison) => {
    const titles = withPluginsSlot(
      comparison.heroVisual,
      [comparison.tailored, ...comparison.sections],
      PLUGINS_COPY,
    ).map((section) => section.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(COMPARISONS)("$slug follows the page rules", (comparison) => {
    const html = renderToStaticMarkup(
      createElement(ComparePage, { comparison }),
    );
    expect(html).not.toMatch(
      /better fit|What do .*? users value|When should I stay|reddit\.com|\b(?:Checked|As of|Updated) (?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\/install\//i,
    );
  });
});
