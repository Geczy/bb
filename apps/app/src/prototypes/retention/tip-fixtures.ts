import type { ComponentProps } from "react";
import { Icon } from "@bb/shared-ui/icon";

export interface TipView {
  id: string;
  title: string;
  body: string;
  icon: ComponentProps<typeof Icon>["name"];
  action: { label: string; prompt: string };
}

export const childTip: TipView = {
  id: "child-threads",
  title: "Let another thread take a piece",
  body: "Keep planning here while a child thread checks the details.",
  icon: "GitBranch",
  action: {
    label: "Draft a child-thread request",
    prompt: "Start a child thread to check the release notes against the merged pull requests. Bring its findings back here.",
  },
};
export const queueTip: TipView = {
  id: "queue-or-steer",
  title: "Add the next step while this runs",
  body: "Queue a follow-up. It starts when this turn finishes.",
  icon: "ListEnd",
  action: {
    label: "Draft a queued follow-up",
    prompt: "When you're done, turn the release summary into a short customer update.",
  },
};
export const pluginTip: TipView = {
  id: "browse-plugins",
  title: "Give your next thread a browser",
  body: "Browse plugins that add tools to bb.",
  icon: "Puzzle",
  action: { label: "Preview Browser Automation", prompt: "" },
};
