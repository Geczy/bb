import { clientMessageSchema, type PongMessage } from "@bb/domain";
import { parseSocketMessage } from "./decode-payload.js";
import type { NotificationHub } from "./hub.js";
import type { WatchInterestCoordinator } from "./watch-interests.js";

const PONG_MESSAGE: PongMessage = { type: "pong" };

interface ClientSocket {
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

export function onClientSocketOpen(
  hub: NotificationHub,
  socket: ClientSocket,
): void {
  hub.registerClient(socket);
}

export function onClientSocketMessage(
  deps: {
    hub: NotificationHub;
    watchInterests: Pick<
      WatchInterestCoordinator,
      "subscribe" | "unsubscribe" | "releaseSocket"
    >;
  },
  socket: ClientSocket,
  raw: unknown,
): void {
  const parsed = parseSocketMessage(socket, raw, clientMessageSchema);
  if (parsed === null) {
    return;
  }

  if (parsed.type === "ping") {
    socket.send(JSON.stringify(PONG_MESSAGE));
    return;
  }
  for (const change of parsed.type === "subscriptions"
    ? parsed.changes
    : [parsed]) {
    if (change.type === "subscribe") {
      deps.hub.subscribe(socket, change.target);
      deps.watchInterests.subscribe(socket, change.target);
    } else {
      deps.hub.unsubscribe(socket, change.target);
      deps.watchInterests.unsubscribe(socket, change.target);
    }
  }
}

export function onClientSocketClose(
  deps: {
    hub: NotificationHub;
    watchInterests: Pick<WatchInterestCoordinator, "releaseSocket">;
  },
  socket: ClientSocket,
): void {
  deps.watchInterests.releaseSocket(socket);
  deps.hub.unregisterClient(socket);
}
