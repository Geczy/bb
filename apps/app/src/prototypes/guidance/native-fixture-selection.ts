import { z } from "zod";

const selectionSchema = z.object({
  kind: z.enum(["reading", "suggestions", "jobs", "no-agent", "next-step", "day2", "hint", "attention", "ready", "setup-agent", "setup-projects"]),
  agentOutcome: z.enum(["ready", "failed"]),
  target: z.union([z.literal("new-thread"), z.string().regex(/^thr_[a-z0-9]+$/)]),
}).refine(value => !["attention", "ready", "hint", "next-step", "day2"].includes(value.kind) || value.target !== "new-thread");

function readSelection() {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const parsed = selectionSchema.safeParse({
    kind: params.get("guidancePrototype"),
    agentOutcome: params.get("guidanceAgentOutcome") ?? "ready",
    target: params.get("guidanceTarget") ?? "new-thread",
  });
  return parsed.success ? parsed.data : null;
}

export const nativeGuidanceFixture = readSelection();
