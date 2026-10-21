// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SendToComputerButton } from "./send-to-computer-button";

let root: Root;
let container: HTMLDivElement;
const writeText = vi.fn<(...args: string[]) => Promise<void>>();
const share = vi.fn<(data: ShareData) => Promise<void>>();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { clipboard: { writeText }, share });
  writeText.mockResolvedValue();
  share.mockResolvedValue();
  history.replaceState(
    null,
    "",
    "/claude-code-parallel-agents?utm_source=community&utm_campaign=desktop-intro&gclid=private-click&bb_variant=private#details",
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<SendToComputerButton placement="hero" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

it("shares the public page and campaign tags without click IDs or private parameters", async () => {
  await click("Get bb on your computer");
  expect(share).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://getbb.app/claude-code-parallel-agents?utm_source=community&utm_campaign=desktop-intro&utm_medium=referral",
    }),
  );
  expect(writeText).not.toHaveBeenCalled();
});

it("lets the reader copy a tagged link even when native sharing is available", async () => {
  history.replaceState(null, "", "/");
  await click("Copy link");
  expect(share).not.toHaveBeenCalled();
  expect(writeText).toHaveBeenCalledWith(
    "https://getbb.app/?utm_source=share&utm_medium=referral&utm_campaign=send-to-computer",
  );
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Link copied",
  );
});

it("does not copy unexpectedly when the reader cancels sharing", async () => {
  share.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  await click("Get bb on your computer");
  expect(writeText).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("");
});

it("falls back to copy when sharing fails", async () => {
  share.mockRejectedValue(new Error("Share unavailable"));
  await click("Get bb on your computer");
  expect(writeText).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Link copied",
  );
});
