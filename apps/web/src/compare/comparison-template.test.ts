import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { COMPARISONS } from "./comparisons";
import { ComparePage, faqJsonLd } from "./compare-page";

const pagesDirectory = fileURLToPath(new URL("./pages/", import.meta.url));
const pages = readdirSync(pagesDirectory).filter((name) =>
  name.endsWith(".tsx"),
);

function parse(name: string) {
  return ts.createSourceFile(
    name,
    readFileSync(`${pagesDirectory}/${name}`, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

describe("comparison template boundary", () => {
  it("gives every comparison metadata entry a library-backed page", () => {
    const metadata = readdirSync(pagesDirectory)
      .filter((name) => name.endsWith(".meta.ts"))
      .map((name) => name.replace(/\.meta\.ts$/, ".tsx"));
    expect(pages.sort()).toEqual(metadata.sort());
  });

  it.each(pages)(
    "%s selects one library entry without page overrides",
    (name) => {
      const source = parse(name);
      expect(source.statements).toHaveLength(2);
      const [importStatement, exportStatement] = source.statements;
      expect(ts.isImportDeclaration(importStatement)).toBe(true);
      if (!ts.isImportDeclaration(importStatement)) return;
      expect(importStatement.moduleSpecifier.getText(source)).toMatch(
        /^["']\.\.\/comparison-library["']$/,
      );
      const bindings = importStatement.importClause?.namedBindings;
      expect(bindings && ts.isNamedImports(bindings)).toBe(true);
      if (!bindings || !ts.isNamedImports(bindings)) return;
      expect(bindings.elements).toHaveLength(1);
      const factory = bindings.elements[0];
      expect((factory.propertyName ?? factory.name).text).toBe(
        "comparisonFromLibrary",
      );
      expect(ts.isVariableStatement(exportStatement)).toBe(true);
      if (!ts.isVariableStatement(exportStatement)) return;
      expect(
        exportStatement.modifiers?.some(
          (item) => item.kind === ts.SyntaxKind.ExportKeyword,
        ),
      ).toBe(true);
      expect(
        exportStatement.declarationList.flags & ts.NodeFlags.Const,
      ).toBeTruthy();
      expect(exportStatement.declarationList.declarations).toHaveLength(1);
      const declaration = exportStatement.declarationList.declarations[0];
      expect(declaration.name.getText(source)).toBe("comparison");
      const initializer = declaration.initializer;
      expect(initializer && ts.isCallExpression(initializer)).toBe(true);
      if (!initializer || !ts.isCallExpression(initializer)) return;
      expect(initializer.expression.getText(source)).toBe(factory.name.text);
      expect(initializer.arguments).toHaveLength(1);
      const key = initializer.arguments[0];
      expect(ts.isStringLiteral(key)).toBe(true);
      if (!ts.isStringLiteral(key)) return;
      expect(key.text).toBe(name.replace(/\.tsx$/, ""));
    },
  );
});

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

describe("fixed comparison template", () => {
  const reference = COMPARISONS[0];

  it.each(COMPARISONS)(
    "$slug shares every non-competitor slot",
    (comparison) => {
      expect(comparison.headline).toBe(
        `The free, open-source ${comparison.competitor.name} alternative`,
      );
      expect(comparison.sub).toBe(reference.sub);
      expect(
        comparison.title.replace(comparison.competitor.name, "COMPETITOR"),
      ).toBe(reference.title.replace(reference.competitor.name, "COMPETITOR"));
      expect(
        comparison.description.replace(
          comparison.competitor.name,
          "COMPETITOR",
        ),
      ).toBe(
        reference.description.replace(reference.competitor.name, "COMPETITOR"),
      );
      expect(comparison.tableNote).toBeNull();
      expect(
        comparison.table.map((group) => ({
          title: group.title,
          rows: group.rows.map(({ feature, bb }) => ({ feature, bb })),
        })),
      ).toEqual(
        reference.table.map((group) => ({
          title: group.title,
          rows: group.rows.map(({ feature, bb }) => ({ feature, bb })),
        })),
      );
      expect(comparison.faqTitle).toBe(reference.faqTitle);
      expect(faqJsonLd(comparison.faq)).toBe(faqJsonLd(reference.faq));
      expect(comparison.sections).toBe(reference.sections);
      expect(comparison.closer).toBe(reference.closer);
    },
  );

  it.each(COMPARISONS)(
    "$slug renders the fixed order with exactly one custom section",
    (comparison) => {
      const html = renderToStaticMarkup(
        createElement(ComparePage, { comparison }),
      );
      const headings = [
        ...html.matchAll(/<h([12])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g),
      ].map((match) => text(match[2]));
      expect(headings).toEqual(
        [
          comparison.headline,
          comparison.tailored.title,
          `bbvs${comparison.competitor.name}`,
          "Turn bb into the tool you need",
          "Let one agent orchestrate the rest",
          "FAQ",
          "Get your agents working together",
          "Product",
          "Guides",
          "Compare",
          "Community",
        ].map(text),
      );
      expect(html).not.toMatch(
        /What do Conductor users value|reddit\.com|Checked October 20|When is .*? a better fit|When should I stay with Vibe Kanban|\/compare\/(?:devin|orca)-alternative|\/install\//,
      );
    },
  );
});
