import { z } from "zod";

export const holdoutKeySchema = z.enum(["app_aa_check"]);
export const holdoutArmSchema = z.enum(["control", "test"]);
export const holdoutStatusSchema = z.enum(["enrolling", "holding", "ended"]);
export type HoldoutKey = z.infer<typeof holdoutKeySchema>;
export type HoldoutArm = z.infer<typeof holdoutArmSchema>;

export const holdoutDefinitionSchema = z.object({
  key: holdoutKeySchema,
  arms: z.tuple([z.literal("control"), z.literal("test")]),
  weights: z.tuple([z.literal(50), z.literal(50)]),
  surface: z.enum(["setup_finished"]),
  status: holdoutStatusSchema,
  winner: holdoutArmSchema.nullable(),
});
export type HoldoutDefinition = z.infer<typeof holdoutDefinitionSchema>;
export const holdoutRegistrySchema = z
  .array(holdoutDefinitionSchema)
  .superRefine((entries, ctx) => {
    const live = entries.filter((entry) => entry.status !== "ended");
    if (
      live.length > 2 ||
      new Set(live.map((entry) => entry.surface)).size !== live.length ||
      new Set(entries.map((entry) => entry.key)).size !== entries.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Holdouts need unique keys and at most two live holdouts on distinct surfaces",
      });
    }
  });
export const holdoutRegistry = holdoutRegistrySchema.parse([
  {
    key: "app_aa_check",
    arms: ["control", "test"],
    weights: [50, 50],
    surface: "setup_finished",
    status: "enrolling",
    winner: null,
  },
]);
export const holdoutForceSchema = z.object({
  key: holdoutKeySchema,
  arm: holdoutArmSchema,
});
export type HoldoutForce = z.infer<typeof holdoutForceSchema>;
