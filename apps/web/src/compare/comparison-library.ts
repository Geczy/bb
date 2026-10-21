import type { Comparison, CompareMeta } from "./compare-types";
import { COMPARISON_COPY } from "./copy-library/shared";
import { COMPETITOR_CELLS } from "./competitor-cells";
import { comparisonTable } from "./table-library";
import { COMPARISON_VISUALS } from "./visual-library";
import {
  COMPARISON_SECTIONS,
  CUSTOM_COMPARISON_SECTIONS,
} from "./section-library";
import { meta as conductorMeta } from "./pages/conductor.meta";
import { meta as cursorMeta } from "./pages/cursor.meta";
import { meta as supersetMeta } from "./pages/superset.meta";
import { meta as t3CodeMeta } from "./pages/t3-code.meta";
import { meta as vibeKanbanMeta } from "./pages/vibe-kanban.meta";

type ComparisonSelection = {
  meta: CompareMeta;
  hero: keyof typeof COMPARISON_VISUALS;
};

const COMPARISON_LIBRARY = {
  conductor: { meta: conductorMeta, hero: "fleet" },
  cursor: { meta: cursorMeta, hero: "agents" },
  superset: { meta: supersetMeta, hero: "fleet" },
  "t3-code": { meta: t3CodeMeta, hero: "agents" },
  "vibe-kanban": { meta: vibeKanbanMeta, hero: "tasks" },
} satisfies Record<keyof typeof COMPETITOR_CELLS, ComparisonSelection>;

export function comparisonFromLibrary(
  id: keyof typeof COMPARISON_LIBRARY,
): Comparison {
  const { meta, hero } = COMPARISON_LIBRARY[id];
  return {
    ...meta,
    title: COMPARISON_COPY.title(meta.competitor.name),
    description: COMPARISON_COPY.description(meta.competitor.name),
    headline: COMPARISON_COPY.headline(meta.competitor.name),
    sub: COMPARISON_COPY.sub,
    heroVisual: COMPARISON_VISUALS[hero],
    tailored: CUSTOM_COMPARISON_SECTIONS[id],
    sections: COMPARISON_SECTIONS,
    tableNote: null,
    table: comparisonTable(COMPETITOR_CELLS[id]),
    faqTitle: COMPARISON_COPY.faqTitle,
    faq: COMPARISON_COPY.faq,
    closer: COMPARISON_COPY.closer,
  };
}
