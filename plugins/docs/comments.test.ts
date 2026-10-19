import { describe, expect, it } from "vitest";
import { exactOccurrences, makeAnchor, resolveAnchor } from "./comments.js";
import { visibleMarkdown } from "./comment-text.js";

const doc = (text: string) => ({ text, lines: Array(text.length).fill(1) });
describe("comment anchors", () => {
  it("uses visible UTF-16 text, excludes frontmatter, and retains code and block boundaries", () => {
    const result = visibleMarkdown(
      "---\ntitle: Hidden\n---\n# Plan\n\nA **bold** [link](https://example.com) 🧰.\n\n```ts\nconst a = 1;\n```",
    );
    expect(result.text).toBe("Plan\n\nA bold link 🧰.\n\nconst a = 1;");
    expect(result.lines[result.text.indexOf("bold")]).toBe(6);
    expect(result.lines[result.text.indexOf("const")]).toBe(9);
  });
  it("anchors duplicate quotes by context before distance", () => {
    const original = "First November 12 release. Second November 12 check.";
    const start = original.lastIndexOf("November 12");
    const anchor = makeAnchor(original, start, start + 11, "before");
    const changed = "Intro. " + original;
    expect(resolveAnchor(doc(changed), "after", anchor).start).toBe(
      changed.lastIndexOf("November 12"),
    );
    expect(exactOccurrences(original, "November 12")).toHaveLength(2);
  });
  it("orphans edited quote text instead of guessing", () => {
    const original = "The beta ships on November 12, behind a toggle.";
    const start = original.indexOf("November");
    const anchor = makeAnchor(original, start, start + 11, "before");
    expect(
      resolveAnchor(doc(original.replace("12", "19")), "after", anchor).state,
    ).toBe("orphaned");
  });
  it("orphans a removed duplicate quote instead of moving it to another sentence", () => {
    const original =
      "Original context before.\n\nShared quoted sentence.\n\nOther context before.\n\nShared quoted sentence.";
    const start = original.indexOf("Shared quoted sentence.");
    const anchor = makeAnchor(original, start, start + 23, "before");
    const removed = original.replace(
      "Original context before.\n\nShared quoted sentence.\n\n",
      "Original context before.\n\n",
    );
    expect(resolveAnchor(doc(removed), "after", anchor).state).toBe("orphaned");
    const shifted = "Inserted far above.\n\n" + original;
    expect(resolveAnchor(doc(shifted), "after", anchor)).toMatchObject({
      state: "moved",
      start: start + "Inserted far above.\n\n".length,
    });
  });
  it("restores an orphan when external undo restores its quote", () => {
    const original = "Ship today.";
    const anchor = makeAnchor(original, 5, 10, "before");
    expect(resolveAnchor(doc("Nothing here."), "after", anchor).state).toBe(
      "orphaned",
    );
    expect(resolveAnchor(doc(original), "before", anchor)).toMatchObject({
      state: "anchored",
      start: 5,
      end: 10,
    });
  });
});
