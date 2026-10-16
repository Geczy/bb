import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRpc, type ExperimentalRpcQueryState } from "@get-bb/plugin-sdk/app";
import type { providerUsageRpcContract, UsageRequest } from "./server.js";
import type { UsageSnapshot } from "./usage-schema.js";

type UsageQuery = ExperimentalRpcQueryState<UsageSnapshot>;

export function useUsageRefresh(
  inventory: UsageQuery,
  measurements: UsageQuery,
  request: UsageRequest,
) {
  const rpc = useRpc<typeof providerUsageRpcContract>();
  const identity = JSON.stringify(request);
  const scope = useRef<{
    identity: string;
    active: boolean;
    pending: number;
    queue: Promise<void>;
  } | null>(null);
  const [status, setStatus] = useState<{
    identity: string;
    pending: boolean;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    const current = {
      identity,
      active: true,
      pending: 0,
      queue: Promise.resolve(),
    };
    scope.current = current;
    return () => {
      current.active = false;
    };
  }, [identity]);
  const receiveInventory = useEffectEvent((data: UsageSnapshot) => {
    const cached = measurements.data;
    if (cached !== undefined) {
      const next: UsageSnapshot = {
        machines: data.machines.map((machine) => {
          const measured = cached.machines.find(
            (item) => item.id === machine.id,
          );
          return {
            ...machine,
            providers: machine.providers.map((provider) => {
              const account = measured?.providers.find(
                (item) =>
                  item.id === provider.id &&
                  item.providerId === provider.providerId,
              );
              return {
                ...provider,
                accountLabel:
                  account?.usage == null
                    ? provider.accountLabel
                    : account.accountLabel,
                usage: account?.usage ?? provider.usage,
              };
            }),
          };
        }),
      };
      if (JSON.stringify(next) !== JSON.stringify(cached)) {
        const refetch = measurements.isFetching || measurements.error !== null;
        measurements.experimental_setData(next);
        if (
          refetch &&
          request.providerIds.length > 0 &&
          data.machines.some(
            (machine) =>
              (request.machineIds === null ||
                request.machineIds.includes(machine.id)) &&
              machine.status === "connected",
          )
        )
          void measurements.refetch();
      }
    }
    setStatus((current) =>
      current?.error == null ? current : { ...current, error: null },
    );
  });
  useEffect(() => {
    if (
      inventory.data !== undefined &&
      !inventory.isFetching &&
      inventory.error === null
    )
      receiveInventory(inventory.data);
  }, [
    inventory.data,
    inventory.isFetching,
    inventory.error,
    measurements.experimental_setData,
  ]);
  useEffect(() => {
    if (
      measurements.data !== undefined &&
      !measurements.isFetching &&
      measurements.error === null
    )
      setStatus((current) =>
        current?.error == null ? current : { ...current, error: null },
      );
  }, [measurements.data, measurements.isFetching, measurements.error]);
  const current = status?.identity === identity ? status : null;
  const reload = () => {
    const currentScope = scope.current;
    if (currentScope === null || currentScope.identity !== identity) return;
    currentScope.pending++;
    setStatus({ identity, pending: true, error: null });
    currentScope.queue = currentScope.queue.then(async () => {
      if (!currentScope.active) return;
      try {
        const result = await rpc.call("getUsage", {
          ...request,
          force: true,
          maxAgeMs: 0,
        });
        if (currentScope.active) {
          measurements.experimental_setData(result);
          inventory.experimental_setData(result);
          setStatus({
            identity,
            pending: currentScope.pending > 1,
            error: null,
          });
        }
      } catch {
        if (currentScope.active)
          setStatus({
            identity,
            pending: currentScope.pending > 1,
            error: "Couldn’t refresh usage.",
          });
      } finally {
        currentScope.pending--;
      }
    });
  };
  return {
    reload,
    forcing: current?.pending ?? false,
    forceError: current?.error ?? null,
  };
}
