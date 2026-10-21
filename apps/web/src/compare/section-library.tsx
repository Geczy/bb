import type { CompareHighlight } from "./compare-types";
import {
  ANYWHERE_COPY,
  anywhereSection,
  PLUGINS_COPY,
  PRICING_COPY,
  pricingSection,
  SPAWN_COPY,
  spawnSection,
  pluginsSection,
  type SectionCopy,
} from "./compare-sections";
import { UsageVisual, TaskLedger } from "./compare-visuals";
import { SUPERSET_LOGO } from "./pages/superset.meta";

const PLANS_SECTION = {
  title: "Every agent on its own subscription",
  wide: false,
  visual: <UsageVisual />,
  body: (
    <>
      <p>Each agent runs on the plan you already pay for.</p>
      <p>
        When an agent hits a usage limit, bb picks the work back up once the
        limit resets.
      </p>
    </>
  ),
};

const PLUGINS_COPY_T3: SectionCopy = {
  title: "Customize everything in the app with plugins",
  body: (
    <>
      <p>
        Plugins can change almost any part of bb: pages, side panels, message
        cards, file editors, and the command palette. They can also add new
        agents, tools and skills for your agents, background jobs, webhooks, and
        machines to run on.
      </p>
      <p>
        400+ are already in the marketplace, and bb still updates every week
        with nothing for you to rebase.
      </p>
    </>
  ),
};

const LEDGER_HIGHLIGHT: CompareHighlight = {
  title: "See the agents on every task",
  wide: false,
  visual: <TaskLedger />,
  body: (
    <p>
      Each task shows its agents working live, with their comments and pull
      requests.
    </p>
  ),
};

export const COMPARISON_SECTIONS = [
  pluginsSection(PLUGINS_COPY),
  spawnSection(SPAWN_COPY),
];

export const CUSTOM_COMPARISON_SECTIONS = {
  conductor: anywhereSection(ANYWHERE_COPY),
  cursor: PLANS_SECTION,
  superset: pricingSection(PRICING_COPY, {
    plan: "Superset Pro",
    logo: SUPERSET_LOGO,
    yearlyPerSeatMonthly: 15,
    priceNote: "Superset Pro at $15 per user a month, billed yearly.",
  }),
  "t3-code": pluginsSection(PLUGINS_COPY_T3),
  "vibe-kanban": LEDGER_HIGHLIGHT,
};
