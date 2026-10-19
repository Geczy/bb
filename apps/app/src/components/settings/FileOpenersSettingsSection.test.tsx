// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { BUILT_IN_FILE_OPENER_PREFERENCE } from "@/lib/file-opener-preference";
import { FileOpenersSettingsSection } from "./FileOpenersSettingsSection";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import {
  resetPluginLogoStoreForTest,
  setPluginLogoUrls,
} from "@/lib/plugin-logos";

function registerNotesOpener() {
  setPluginLogoUrls(
    new Map([
      [
        "simple-notes",
        {
          displayName: "Docs",
          icon: null,
          compactIconUrl: null,
          logoUrl: null,
          logoDarkUrl: null,
          icons: new Map(),
        },
      ],
    ]),
  );
  setPluginSlotRegistrations(
    "simple-notes",
    makePluginRegistrationSet({
      fileOpeners: [
        {
          id: "docs",
          title: "Markdown",
          extensions: ["md", "mdx"],
          component: () => null,
        },
      ],
    }),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetPluginSlotStoreForTest();
  resetPluginLogoStoreForTest();
});

describe("FileOpenersSettingsSection", () => {
  it("defaults to automatic and persists built-in, plugin, and automatic choices", async () => {
    registerNotesOpener();
    render(<FileOpenersSettingsSection />);

    expect(screen.getByText(".md files")).toBeDefined();
    expect(screen.getByText(".mdx files")).toBeDefined();
    const trigger = screen.getByRole("button", {
      name: "Default opener for .md files",
    });
    expect(trigger.textContent).toContain("Automatic (Docs)");

    await selectOption(trigger, /Built-in preview/u);
    expect(storedPreference()).toEqual({
      md: BUILT_IN_FILE_OPENER_PREFERENCE,
    });

    await selectOption(trigger, /Docs \(Markdown\)/u);
    expect(storedPreference()).toEqual({ md: "simple-notes:docs" });

    await selectOption(trigger, /Automatic/u);
    expect(storedPreference()).toEqual({});
  });

  it("shows the plugin name once when the opener title repeats it", async () => {
    setPluginLogoUrls(
      new Map([
        [
          "monaco-editor",
          {
            displayName: "File Editor",
            icon: null,
            compactIconUrl: null,
            logoUrl: null,
            logoDarkUrl: null,
            icons: new Map(),
          },
        ],
      ]),
    );
    setPluginSlotRegistrations(
      "monaco-editor",
      makePluginRegistrationSet({
        fileOpeners: [
          {
            id: "editor",
            title: "File Editor",
            extensions: ["ts"],
            component: () => null,
          },
        ],
      }),
    );
    render(<FileOpenersSettingsSection />);

    const trigger = screen.getByRole("button", {
      name: "Default opener for .ts files",
    });
    fireEvent.pointerDown(trigger, { button: 0 });
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toContain("File Editor");
    expect(
      items.some((item) =>
        item.textContent?.includes("File Editor (File Editor)"),
      ),
    ).toBe(false);
  });
});

async function selectOption(trigger: HTMLElement, name: RegExp) {
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

function storedPreference(): Record<string, string> {
  return JSON.parse(
    window.localStorage.getItem("bb.fileOpenerByExtension") ?? "{}",
  ) as Record<string, string>;
}
