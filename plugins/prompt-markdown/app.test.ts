import { describe, expect, it } from "vitest";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));

describe("Prompt Markdown app", () => {
  it("registers paint-only rules and Shift+Enter list continuation", () => {
    const [customization] = app.composerCustomizations;
    const effects = customization?.richText?.effects ?? [];
    expect(
      effects
        .filter((effect) => effect.experimental_offCaretLineOnly === true)
        .map((effect) => effect.id),
    ).toEqual(["marker", "bullet"]);
    const strong = effects.find((effect) => effect.id === "strong");
    expect(
      strong?.experimental_matchDraft?.({ text: "a **b**", mentions: [] }),
    ).toEqual([{ from: 4, to: 5 }]);
    expect(
      customization?.richText?.experimental_continueLine?.("- one"),
    ).toEqual({ kind: "continue", prefix: "- " });
  });
});
