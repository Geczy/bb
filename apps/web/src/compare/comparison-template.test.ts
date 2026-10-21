import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

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
