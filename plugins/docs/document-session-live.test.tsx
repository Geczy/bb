// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useDocumentSession, useSavedDocument } from "./document-session.js";

const liveRead = { vaultId: "personal", path: "read-errors.md" };
const savedIO = {
  liveRead,
  delay: 500,
  read: async () => {
    throw new Error("Live reads use queries");
  },
  write: async () => ({ outcome: "conflict" as const }),
};

function DocumentStatus({ saved }: { saved: boolean }) {
  return saved ? <SavedStatus /> : <SessionStatus />;
}

function SavedStatus() {
  const { state } = useSavedDocument(savedIO);
  return <div>{state.error ?? (state.loaded ? state.content : "Loading")}</div>;
}

function SessionStatus() {
  const { state } = useDocumentSession(liveRead.vaultId, liveRead.path);
  return <div>{state.error ?? (state.loaded ? state.content : "Loading")}</div>;
}

afterEach(cleanup);

it.each([
  { saved: false, method: "readNote" },
  { saved: false, method: "readProposal" },
  { saved: false, method: "preparePreview" },
  { saved: true, method: "readNote" },
  { saved: true, method: "preparePreview" },
])(
  "surfaces $method failures and recovers for saved=$saved",
  async ({ saved, method }) => {
    let failing = true;
    const results = {
      readNote: { content: "Recovered document", sha256: "sha" },
      readProposal: null,
      preparePreview: { baseUrl: "/preview", expiresAtMs: Date.now() + 60_000 },
    };
    const slot = renderSlot(
      { component: DocumentStatus },
      { saved },
      {
        rpc: Object.fromEntries(
          Object.entries(results).map(([name, result]) => [
            name,
            () => {
              if (name === method && failing)
                throw new Error(`${method} unavailable`);
              return result;
            },
          ]),
        ),
      },
    );
    await waitFor(() =>
      expect(slot.getByText(`${method} unavailable`)).toBeTruthy(),
    );
    failing = false;
    await act(async () => slot.experimental_invalidateRpc());
    await waitFor(() =>
      expect(slot.getByText("Recovered document")).toBeTruthy(),
    );
  },
);
