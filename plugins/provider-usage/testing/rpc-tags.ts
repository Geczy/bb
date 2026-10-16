import { providerUsageRpcContract } from "../server.js";

export function usageRpcTags(_method: string, input: unknown) {
  const request = providerUsageRpcContract.getUsage.input.parse(input);
  return {
    tags: [
      "inventory",
      ...(request.providerIds.length === 0
        ? []
        : [
            "usage",
            ...(request.machineIds?.map((id) => `usage:${id}`) ?? [
              "usage:all",
            ]),
          ]),
    ],
  };
}
