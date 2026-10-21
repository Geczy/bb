import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod/mini";
import { usageSnapshotSchema } from "./usage-schema.js";

export const usageRequestSchema = z.strictObject({
  force: z.boolean(),
  machineIds: z.nullable(z.array(z.string().check(z.minLength(1)))),
  providerIds: z.array(z.string().check(z.minLength(1))),
  maxAgeMs: z.number().check(z.int(), z.nonnegative()),
});
export const usageTags = (request: z.infer<typeof usageRequestSchema>) => [
  "inventory",
  ...(request.providerIds.length
    ? [
        "usage",
        ...(request.machineIds?.map((id) => `usage:${id}`) ?? ["usage:all"]),
      ]
    : []),
];
export const providerUsageRpcContract = defineRpcContract({
  getUsage: {
    input: usageRequestSchema,
    output: usageSnapshotSchema,
    tags: usageTags,
    invalidates: (input) => (input.force ? ["inventory", "usage"] : []),
  },
  refreshUsage: {
    input: z.omit(usageRequestSchema, { force: true }),
    output: usageSnapshotSchema,
    invalidates: () => ["inventory", "usage"],
  },
});

export type UsageRequest = z.infer<
  typeof providerUsageRpcContract.getUsage.input
>;
