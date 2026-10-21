import { z } from "zod";

export const featureFlagsSchema = z.object({
  placeholder: z.boolean(),
  workOriginTelemetry: z.boolean(),
  timelineWindowEventBudget: z.number().int().positive(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const defaultFeatureFlags: FeatureFlags = {
  placeholder: false,
  workOriginTelemetry: false,
  timelineWindowEventBudget: 1_500,
};
