import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "./proposals.js";
import { createDocumentSession } from "./document-session.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRealtime: vi.fn(),
  useRpc: vi.fn(),
}));

type Rpc = Parameters<typeof createDocumentSession>[0];

function file(content = "Original", sha256 = "original-sha") {
  return {
    path: "letter.md",
    content,
    sha256,
    contentEncoding: "utf8" as const,
    sizeBytes: content.length,
  };
}

function proposal(
  status: Proposal["status"] = "pending",
  version = 1,
): Proposal {
  return {
    vaultId: "personal",
    path: "letter.md",
    version,
    baseContent: "Original",
    baseSha256: "original-sha",
    content: "Candidate",
    status,
    resolvedSha256: status === "accepted" ? "accepted-sha" : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function loadedSession(
  pending: Proposal | null = null,
  current = file(),
) {
  const call = vi.fn<Rpc["call"]>();
  call.mockResolvedValueOnce(current);
  call.mockResolvedValueOnce(pending);
  call.mockResolvedValueOnce({
    baseUrl: "/preview",
    expiresAtMs: Date.now() + 60_000,
  });
  const session = createDocumentSession({ call }, "personal", "letter.md");
  await session.refresh();
  call.mockClear();
  return { session, call };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Docs document sessions", () => {
  it("renews expired previews when a cached document refreshes", async () => {
    const { session, call } = await loadedSession();
    vi.advanceTimersByTime(60_001);
    call.mockResolvedValueOnce(file());
    call.mockResolvedValueOnce(null);
    call.mockResolvedValueOnce({
      baseUrl: "/renewed-preview",
      expiresAtMs: Date.now() + 60_000,
    });
    await session.refresh();
    expect(call).toHaveBeenCalledWith("preparePreview", {
      vaultId: "personal",
      path: "letter.md",
    });
    expect(session.getSnapshot().previewBaseUrl).toBe("/renewed-preview");
  });

  it("accepts renewed preview URLs without replacing unsaved text", async () => {
    const { session } = await loadedSession();
    session.edit("Unsaved draft");
    await session.receive({
      content: "Original",
      sha256: "original-sha",
      proposal: null,
      previewBaseUrl: "/renewed-preview",
      previewPath: "letter.md",
    });
    expect(session.getSnapshot()).toMatchObject({
      draft: "Unsaved draft",
      dirty: true,
      previewBaseUrl: "/renewed-preview",
    });
  });

  it.each([false, true])(
    "rechecks snapshots queued behind a save (remote edit: %s)",
    async (remoteEdit) => {
      const { session, call } = await loadedSession();
      const pending = deferred<{
        outcome: "written";
        sha256: string;
        sizeBytes: number;
      }>();
      call.mockReturnValueOnce(pending.promise);
      const latest = remoteEdit
        ? file("Later remote edit", "remote-sha")
        : file("My saved edit", "saved-sha");
      call.mockResolvedValueOnce(latest);
      call.mockResolvedValueOnce(null);
      session.edit("My saved edit");
      const saving = session.flush();
      await Promise.resolve();
      const incoming = session.receive({
        ...file(),
        proposal: null,
        previewBaseUrl: "/preview",
        previewPath: "letter.md",
      });
      pending.resolve({
        outcome: "written",
        sha256: "saved-sha",
        sizeBytes: 13,
      });
      await saving;
      await incoming;
      expect(session.getSnapshot()).toMatchObject({
        content: latest.content,
        draft: latest.content,
        sha256: latest.sha256,
        dirty: false,
        conflict: false,
      });
    },
  );

  it.each(["file", "proposal"] as const)(
    "rereads a %s snapshot that arrives after the save that replaced it",
    async (kind) => {
      const { session, call } = await loadedSession(
        kind === "proposal" ? proposal("pending", 1) : null,
      );
      const saved =
        kind === "proposal"
          ? { ...proposal("pending", 2), content: "My saved edit" }
          : { outcome: "written" as const, sha256: "saved-sha", sizeBytes: 13 };
      call.mockResolvedValueOnce(saved);
      session.edit("My saved edit");
      await session.flush();
      call.mockResolvedValueOnce(
        kind === "proposal" ? file() : file("My saved edit", "saved-sha"),
      );
      call.mockResolvedValueOnce(kind === "proposal" ? saved : null);
      await session.receive({
        ...file(),
        proposal: kind === "proposal" ? proposal("pending", 1) : null,
        previewBaseUrl: "/preview",
        previewPath: "letter.md",
      });
      expect(call).toHaveBeenCalledWith("readNote", {
        vaultId: "personal",
        path: "letter.md",
      });
      expect(session.getSnapshot()).toMatchObject({
        draft: "My saved edit",
        dirty: false,
        conflict: false,
      });
    },
  );

  it("drains edits made during a save using the returned file hash", async () => {
    const { session, call } = await loadedSession();
    const first = deferred<{
      outcome: "written";
      sha256: string;
      sizeBytes: number;
    }>();
    call.mockReturnValueOnce(first.promise);
    call.mockResolvedValueOnce({
      outcome: "written",
      sha256: "second-sha",
      sizeBytes: 6,
    });
    session.edit("First");
    const saving = session.flush();
    await Promise.resolve();
    session.edit("Second");
    first.resolve({ outcome: "written", sha256: "first-sha", sizeBytes: 5 });
    await saving;
    expect(call.mock.calls).toEqual([
      [
        "saveNote",
        {
          vaultId: "personal",
          path: "letter.md",
          content: "First",
          expectedSha256: "original-sha",
        },
      ],
      [
        "saveNote",
        {
          vaultId: "personal",
          path: "letter.md",
          content: "Second",
          expectedSha256: "first-sha",
        },
      ],
    ]);
    expect(session.getSnapshot()).toMatchObject({
      draft: "Second",
      content: "Second",
      sha256: "second-sha",
      dirty: false,
      saving: false,
    });
  });

  it("keeps the local draft and original hash when a save conflicts", async () => {
    const { session, call } = await loadedSession();
    call.mockResolvedValueOnce({
      outcome: "conflict",
      currentSha256: "remote-sha",
    });
    session.edit("Keep my edit");
    await expect(session.flush()).rejects.toThrow("edits are preserved");
    expect(session.getSnapshot()).toMatchObject({
      draft: "Keep my edit",
      content: "Original",
      sha256: "original-sha",
      dirty: true,
      saving: false,
    });
  });

  it("flushes a candidate before accepting with its newest proposal version", async () => {
    const { session, call } = await loadedSession(proposal());
    call.mockResolvedValueOnce({
      ...proposal("pending", 2),
      content: "Edited candidate",
    });
    call.mockResolvedValueOnce({
      ...proposal("accepted", 3),
      content: "Edited candidate",
    });
    call.mockResolvedValueOnce(file("Edited candidate", "accepted-sha"));
    session.edit("Edited candidate");
    await session.resolve("accept");
    expect(call.mock.calls).toEqual([
      [
        "updateProposal",
        {
          vaultId: "personal",
          path: "letter.md",
          content: "Edited candidate",
          expectedVersion: 1,
        },
      ],
      [
        "resolveProposal",
        {
          vaultId: "personal",
          path: "letter.md",
          action: "accept",
          expectedVersion: 2,
        },
      ],
      ["readNote", { vaultId: "personal", path: "letter.md" }],
    ]);
    expect(session.getSnapshot()).toMatchObject({
      draft: "Edited candidate",
      content: "Edited candidate",
      dirty: false,
      busy: false,
      proposal: { status: "accepted", version: 3 },
    });
  });

  it("does not resolve a proposal when saving its candidate fails", async () => {
    const { session, call } = await loadedSession(proposal());
    call.mockRejectedValueOnce(new Error("The proposal changed."));
    session.edit("My candidate edit");
    await session.resolve("accept");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("updateProposal", {
      vaultId: "personal",
      path: "letter.md",
      content: "My candidate edit",
      expectedVersion: 1,
    });
    expect(session.getSnapshot()).toMatchObject({
      draft: "My candidate edit",
      dirty: true,
      busy: false,
      error: "The proposal changed.",
    });
  });

  it("preserves dirty text when a remote refresh returns changed content", async () => {
    const { session, call } = await loadedSession();
    call.mockResolvedValueOnce(file("Remote edit", "remote-sha"));
    call.mockResolvedValueOnce(null);
    session.edit("My unsaved edit");
    await session.refresh();
    expect(session.getSnapshot()).toMatchObject({
      draft: "My unsaved edit",
      content: "Original",
      sha256: "original-sha",
      dirty: true,
    });
    expect(session.getSnapshot().error).toContain("edits are preserved");
  });

  it("preserves text typed while a refresh is in flight", async () => {
    const { session, call } = await loadedSession(proposal());
    const remote = deferred<ReturnType<typeof file>>();
    call.mockReturnValueOnce(remote.promise);
    call.mockResolvedValueOnce(proposal("pending", 2));
    const refreshing = session.refresh();
    session.edit("My candidate edit");
    remote.resolve(file());
    await refreshing;
    expect(session.getSnapshot()).toMatchObject({
      draft: "My candidate edit",
      dirty: true,
      proposal: { version: 1 },
    });
  });

  it("keeps a queued refresh from replacing the proposal being accepted", async () => {
    const { session, call } = await loadedSession(proposal());
    call.mockResolvedValueOnce(file());
    call.mockResolvedValueOnce(proposal("pending", 2));
    call.mockRejectedValueOnce(new Error("The proposal changed."));
    const refresh = session.refresh();
    await session.resolve("accept");
    await refresh;
    expect(call).toHaveBeenLastCalledWith("resolveProposal", {
      vaultId: "personal",
      path: "letter.md",
      action: "accept",
      expectedVersion: 1,
    });
    expect(session.getSnapshot()).toMatchObject({
      proposal: { version: 1 },
      error: "The proposal changed.",
      busy: false,
    });
  });
});

it("clears a failed save after a successful read without losing the draft", async () => {
  const { session, call } = await loadedSession();
  session.edit("Unsaved draft");
  call.mockRejectedValueOnce(new Error("Save unavailable"));
  await expect(session.flush()).rejects.toThrow("Save unavailable");
  expect(session.getSnapshot().error).toBe("Save unavailable");
  await session.receive({
    content: "Original",
    sha256: "original-sha",
    proposal: null,
    previewBaseUrl: "/preview",
    previewPath: "letter.md",
  });
  expect(session.getSnapshot()).toMatchObject({
    error: null,
    draft: "Unsaved draft",
    dirty: true,
  });
});
