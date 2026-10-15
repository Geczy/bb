import { realtimeSubscriptionTargetSchema } from "@bb/domain";
import type { z } from "zod";

const subscriptionKinds = new Set<string>(
  realtimeSubscriptionTargetSchema.options.map(
    (option) => option.shape.kind.value,
  ),
);

function isUnknownSubscription(decoded: unknown): boolean {
  return (
    typeof decoded === "object" &&
    decoded !== null &&
    "type" in decoded &&
    (decoded.type === "subscribe" || decoded.type === "unsubscribe") &&
    "target" in decoded &&
    typeof decoded.target === "object" &&
    decoded.target !== null &&
    "kind" in decoded.target &&
    typeof decoded.target.kind === "string" &&
    !subscriptionKinds.has(decoded.target.kind)
  );
}

function decodeSocketPayload(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
      "utf8",
    );
  }
  return String(raw);
}

export function parseSocketMessage<T>(
  socket: { close(code?: number, reason?: string): void },
  raw: unknown,
  schema: z.ZodType<T>,
): T | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeSocketPayload(raw));
  } catch {
    socket.close(1008, "invalid-message");
    return null;
  }

  if (isUnknownSubscription(decoded)) return null;
  if (
    typeof decoded === "object" &&
    decoded !== null &&
    "type" in decoded &&
    decoded.type === "subscriptions" &&
    "changes" in decoded &&
    Array.isArray(decoded.changes)
  ) {
    decoded = {
      ...decoded,
      changes: decoded.changes.filter(
        (change: unknown) => !isUnknownSubscription(change),
      ),
    };
  }
  const result = schema.safeParse(decoded);
  if (!result.success) {
    socket.close(1008, "invalid-message");
    return null;
  }
  return result.data;
}
