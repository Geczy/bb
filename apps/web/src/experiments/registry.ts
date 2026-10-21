export type PageExperiment = {
  id: string;
  recordId: string;
  slot: "holdout" | "hero" | "lower" | "page";
  pages: readonly string[];
  segment: "all";
  variants: readonly { key: string; weight: number }[];
  status: "live" | "stopped";
};

export const PAGE_EXPERIMENT_REGISTRY: readonly PageExperiment[] = [
  {
    id: "pg_00",
    recordId: "PG-00",
    slot: "holdout",
    pages: ["/"],
    segment: "all",
    variants: [
      { key: "holdout", weight: 10 },
      { key: "control", weight: 90 },
    ],
    status: "live",
  },
  {
    id: "pg_aa",
    recordId: "PG-AA",
    slot: "hero",
    pages: ["/"],
    segment: "all",
    variants: [
      { key: "control", weight: 50 },
      { key: "control_copy", weight: 50 },
    ],
    status: "live",
  },
];

export const ADS_TEST_PAGES: readonly string[] = [
  "/",
  "/claude-code-parallel-agents",
];

export type PageExperimentContext = {
  pageExperiments?: Record<string, string>;
};
