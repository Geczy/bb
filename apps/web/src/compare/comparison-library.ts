import type { Comparison } from "./compare-types";
import { COMPARISON_VISUALS } from "./visual-library";
import {
  COMPARISON_SECTIONS,
  CUSTOM_COMPARISON_SECTIONS,
} from "./section-library";
import { copy as conductorCopy } from "./copy-library/conductor";
import { meta as conductorMeta } from "./pages/conductor.meta";
import { copy as cursorCopy } from "./copy-library/cursor";
import { meta as cursorMeta } from "./pages/cursor.meta";
import { copy as supersetCopy } from "./copy-library/superset";
import { meta as supersetMeta } from "./pages/superset.meta";
import { copy as t3CodeCopy } from "./copy-library/t3-code";
import { meta as t3CodeMeta } from "./pages/t3-code.meta";
import { copy as vibeKanbanCopy } from "./copy-library/vibe-kanban";
import { meta as vibeKanbanMeta } from "./pages/vibe-kanban.meta";

export type ComparisonCopy = Pick<
  Comparison,
  | "title"
  | "description"
  | "headline"
  | "sub"
  | "tableNote"
  | "table"
  | "faqTitle"
  | "faq"
  | "closer"
>;

type ComparisonSelection = {
  meta: Pick<Comparison, "slug" | "competitor">;
  copy: ComparisonCopy;
  hero: keyof typeof COMPARISON_VISUALS;
  custom: keyof typeof CUSTOM_COMPARISON_SECTIONS;
  sections: (keyof typeof COMPARISON_SECTIONS)[];
};

const COMPARISON_LIBRARY = {
  conductor: {
    meta: conductorMeta,
    copy: conductorCopy,
    hero: "fleet",
    custom: "conductor",
    sections: ["conductorCost", "limits", "agents"],
  },
  cursor: {
    meta: cursorMeta,
    copy: cursorCopy,
    hero: "agents",
    custom: "cursor",
    sections: ["spawn", "anywhere"],
  },
  superset: {
    meta: supersetMeta,
    copy: supersetCopy,
    hero: "fleet",
    custom: "superset",
    sections: ["agents", "limits", "anywhere"],
  },
  "t3-code": {
    meta: t3CodeMeta,
    copy: t3CodeCopy,
    hero: "agents",
    custom: "t3-code",
    sections: ["spawn", "limits", "anywhere"],
  },
  "vibe-kanban": {
    meta: vibeKanbanMeta,
    copy: vibeKanbanCopy,
    hero: "tasks",
    custom: "vibe-kanban",
    sections: ["agents"],
  },
} satisfies Record<string, ComparisonSelection>;

export function comparisonFromLibrary(
  id: keyof typeof COMPARISON_LIBRARY,
): Comparison {
  const selection = COMPARISON_LIBRARY[id];
  return {
    ...selection.meta,
    ...selection.copy,
    heroVisual: COMPARISON_VISUALS[selection.hero],
    tailored: CUSTOM_COMPARISON_SECTIONS[selection.custom],
    sections: selection.sections.map((key) => COMPARISON_SECTIONS[key]),
  };
}
