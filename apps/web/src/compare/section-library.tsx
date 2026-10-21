import type { CompareHighlight } from "./compare-types";
import {
  AGENTS_COPY,
  agentsSection,
  ANYWHERE_COPY,
  anywhereSection,
  PRICING_COPY,
  pricingSection,
  LIMITS_COPY,
  limitsSection,
  SPAWN_COPY,
  spawnSection,
  pluginsSection,
  type SectionCopy,
} from "./compare-sections";
import { UsageVisual, TaskLedger } from "./compare-visuals";
import { CONDUCTOR_LOGO } from "./pages/conductor.meta";
import { SUPERSET_LOGO } from "./pages/superset.meta";

const COST_SECTION = pricingSection(PRICING_COPY, {
  plan: "Conductor Teams",
  logo: CONDUCTOR_LOGO,
  yearlyPerSeatMonthly: 60,
  priceNote: "Conductor Teams at $60 per person a month.",
});

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

export const COMPARISON_SECTIONS = {
  agents: agentsSection(AGENTS_COPY),
  anywhere: anywhereSection(ANYWHERE_COPY),
  conductorCost: COST_SECTION,
  limits: limitsSection(LIMITS_COPY),
  spawn: spawnSection(SPAWN_COPY),
};

export const CUSTOM_COMPARISON_SECTIONS = {
  conductor: COMPARISON_SECTIONS.anywhere,
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
