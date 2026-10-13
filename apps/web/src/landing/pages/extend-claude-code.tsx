import type { LandingPage } from "../landing-template";
import {
  FAQ_PRIVACY,
  FAQ_SUBSCRIPTIONS,
  faqFree,
} from "../../compare/compare-content";
import { AnywhereVisual, UsageVisual } from "../../compare/compare-visuals";
import { PARALLEL_SECTION } from "../landing-shared";
import { meta } from "./extend-claude-code.meta";

export const page: LandingPage = {
  ...meta,
  title: "Extend How You Work with Claude Code — bb",
  description:
    "bb runs your Claude Code sessions in a Mac app you can extend: usage limits in view, alerts when a session needs you, themes, and plugins your agent can build. Free and open source.",
  headline: "Extend how you work with Claude Code",
  sub: "bb runs your Claude Code sessions in a Mac app you can extend with plugins, with your usage limits always in view. Free and open source.",
  closer: "Get more out of Claude Code",
  macOnly: true,
  heroVisual: <UsageVisual />,
  sections: [
    {
      title: "See which session needs you",
      wide: false,
      visual: <AnywhereVisual />,
      body: (
        <>
          <p>
            The thread list marks every session as running, waiting on you, or
            done.
          </p>
          <p>
            When an agent asks a question, finishes, or stops on an error, bb
            sends a desktop notification, and the bb mobile app can send one to
            your phone.
          </p>
        </>
      ),
    },
    {
      title: "Make bb look the way you want",
      wide: true,
      visual: null,
      body: (
        <p>
          Pick a palette in Settings → Appearance, install a theme from a
          plugin, or have an agent design your own.
        </p>
      ),
    },
    PARALLEL_SECTION,
  ],
  faq: [
    {
      title: "Extending Claude Code with bb",
      items: [
        {
          question: "Is this a Claude Code mod?",
          answer: (
            <p>
              No. Mods run inside Claude Code. bb runs your Claude Code
              sessions in its own app, so you can use both together.
            </p>
          ),
        },
        {
          question: "Can I see my Claude Code usage limits?",
          answer: (
            <p>
              Yes. Provider usage, built into bb, shows each usage window, how
              much you’ve used, and when it resets. Pin it to the sidebar to
              keep it in view.
            </p>
          ),
        },
        {
          question: "What can a bb plugin add?",
          answer: (
            <p>
              Panels, commands, tools your agents can call, themes, and new
              agents. Plugins work in the mobile app too. Find them in the{" "}
              <a href="/marketplace">plugin marketplace</a>.
            </p>
          ),
        },
        {
          question: "Can Claude Code build a plugin for me?",
          answer: (
            <p>
              Yes. Describe what you want in a bb thread, and the agent builds
              it as a bb plugin. The <a href="/plugin-guide">Plugin Guide</a>{" "}
              covers everything a plugin can do.
            </p>
          ),
        },
      ],
    },
    {
      title: "Getting started",
      items: [
        {
          question: "How do I get started?",
          answer: (
            <ol>
              <li>
                Download bb for <a href="/download/macos">macOS</a> (Apple
                Silicon).
              </li>
              <li>Install and sign in to Claude Code.</li>
              <li>
                Open bb, add your project folder, and type your first request.
              </li>
            </ol>
          ),
        },
        FAQ_SUBSCRIPTIONS,
        faqFree(""),
        FAQ_PRIVACY,
      ],
    },
  ],
};
