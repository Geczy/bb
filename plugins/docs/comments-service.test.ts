import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createCommentsService } from "./comments-service.js";
import { commentsFileSchema, makeAnchor } from "./comments.js";
import { visibleMarkdown } from "./comment-text.js";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const hash = (content: string) =>
  createHash("sha256").update(content).digest("hex");
function setup() {
  const files = new Map([
    ["/vault/plan.md", "# Plan\n\nShip on November 12.\n"],
  ]);
  let beforeWrite: (() => void) | null = null;
  const host = createFakePluginHost({
    pluginId: "simple-notes",
    sdk: {
      files: {
        read: async ({ path }) => {
          const content = files.get(path);
          if (content === undefined) throw new Error("ENOENT");
          return {
            path,
            content,
            contentEncoding: "utf8",
            sizeBytes: Buffer.byteLength(content),
            sha256: hash(content),
          };
        },
        write: async ({ path, content, expectedSha256 }) => {
          beforeWrite?.();
          const current = files.get(path);
          const currentSha256 = current === undefined ? null : hash(current);
          if (expectedSha256 !== currentSha256)
            return { outcome: "conflict", currentSha256 };
          files.set(path, content);
          return {
            outcome: "written",
            sha256: hash(content),
            sizeBytes: Buffer.byteLength(content),
          };
        },
      },
    },
  });
  disposers.push(() => host.harness.lifecycle.dispose());
  const service = createCommentsService(host.bb, async () => ({
    path: "/vault/plan.md",
    rootPath: "/vault",
    hostId: null,
  }));
  return {
    service,
    files,
    host,
    race: (callback: (() => void) | null) => {
      beforeWrite = callback;
    },
  };
}
const target = { vaultId: "plans", path: "plan.md" };
const sidecar = "/vault/.bb-comments/plan.md.json";
describe("comment sidecar mutations", () => {
  it("merges competing creates without changing document bytes", async () => {
    const { service, files } = setup();
    const original = files.get("/vault/plan.md");
    await Promise.all([
      service.add(
        { ...target, quote: "November 12", body: "One" },
        service.user,
      ),
      service.add(
        { ...target, quote: "November 12", body: "Two" },
        service.user,
      ),
    ]);
    expect(
      (await service.list(target)).threads
        .map((thread) => thread.messages[0].body)
        .sort(),
    ).toEqual(["One", "Two"]);
    expect(files.get("/vault/plan.md")).toBe(original);
  });
  it("does not resurrect a deleted root when a concurrent reply retries", async () => {
    const { service, files, race } = setup();
    const added = await service.add(
      {
        ...target,
        quote: "November 12",
        body: "Question",
      },
      service.user,
    );
    race(() => {
      files.set(sidecar, JSON.stringify({ version: 1, threads: [] }));
      race(null);
    });
    await expect(
      service.reply(
        {
          ...target,
          commentId: added.threads[0].id,
          body: "Late answer",
        },
        service.user,
      ),
    ).rejects.toThrow("deleted");
    expect((await service.list(target)).threads).toHaveLength(0);
  });
  it("reads malformed sidecars as empty and fails closed on mutation", async () => {
    const { service, files } = setup();
    files.set(sidecar, "broken JSON");
    expect(await service.list(target)).toMatchObject({
      threads: [],
      notice: expect.stringContaining("malformed"),
    });
    await expect(
      service.add(
        { ...target, quote: "November 12", body: "Question" },
        service.user,
      ),
    ).rejects.toThrow("malformed");
    expect(files.get(sidecar)).toBe("broken JSON");
  });
  it("bounds CAS retries and returns the conflict exit code", async () => {
    const { service, files, race } = setup();
    let writes = 0;
    race(() => {
      writes++;
      files.set(
        sidecar,
        JSON.stringify({ version: 1, threads: [] }) + " ".repeat(writes),
      );
    });
    await expect(
      service.add(
        { ...target, quote: "November 12", body: "Question" },
        service.user,
      ),
    ).rejects.toMatchObject({ code: "conflict", exitCode: 3 });
    expect(writes).toBe(4);
  });
  it("keeps agent attribution and prevents user editing or deleting agent replies", async () => {
    const { service, files } = setup();
    const added = await service.add(
      {
        ...target,
        quote: "November 12",
        body: "Question",
      },
      service.user,
    );
    const commentId = added.threads[0].id;
    const replied = await service.reply(
      { ...target, commentId, body: "Answer" },
      { kind: "agent", threadId: "thr_agent", name: "Planner" },
    );
    const messageId = replied.threads[0].messages[1].id;
    await expect(
      service.edit({ ...target, commentId, messageId, body: "Changed" }),
    ).rejects.toThrow("author");
    await expect(
      service.delete({ ...target, commentId, messageId }),
    ).rejects.toThrow("author");
    expect(
      commentsFileSchema.parse(JSON.parse(files.get(sidecar)!)).threads[0]
        .messages[1].author,
    ).toMatchObject({ kind: "agent", threadId: "thr_agent" });
  });
  it("preserves orphan discussions through resolve, reopen and reattach", async () => {
    const { service, files } = setup();
    const added = await service.add(
      {
        ...target,
        quote: "November 12",
        body: "Question",
      },
      service.user,
    );
    const commentId = added.threads[0].id;
    files.set("/vault/plan.md", "# Replacement\n\nNew date.\n");
    expect((await service.list(target)).threads[0].anchor.state).toBe(
      "orphaned",
    );
    await service.status(
      { ...target, commentId, resolved: true },
      service.user,
    );
    await service.status(
      { ...target, commentId, resolved: false },
      service.user,
    );
    const result = await service.reattach({
      ...target,
      commentId,
      quote: "New date",
      occurrence: 1,
    });
    expect(result.threads[0]).toMatchObject({
      status: "open",
      anchor: { state: "anchored", quote: "New date" },
    });
    expect(result.threads[0].messages[0].body).toBe("Question");
  });
  it("never persists a refreshed anchor onto another sentence after a live external edit", async () => {
    const { service, files } = setup();
    const original =
      "# Plan\n\nIntro.\n\n---\n\nAfter dash rule target sentence.\n\n***\n\nAfter star rule target sentence.\n";
    files.set("/vault/plan.md", original);
    await service.add(
      { ...target, quote: "After dash rule target sentence.", body: "Dash" },
      service.user,
    );
    const star = await service.add(
      { ...target, quote: "After star rule target sentence.", body: "Star" },
      service.user,
    );
    const starId = star.threads.find(
      (thread) => thread.messages[0].body === "Star",
    )!.id;
    const edited = original
      .replace("Intro.", "Intro.\n\nInserted externally.")
      .replace(
        "After star rule target sentence.",
        "After star rule rewritten sentence.",
      );
    files.set("/vault/plan.md", edited);
    const text = visibleMarkdown(edited).text;
    const rewrittenStart = text.indexOf("After star rule rewritten sentence.");
    await service.refresh({
      ...target,
      documentSha256: hash(edited),
      anchors: [
        {
          id: starId,
          anchor: makeAnchor(
            text,
            rewrittenStart,
            rewrittenStart + "After star rule rewritten sentence.".length,
            hash(edited),
          ),
        },
      ],
    });
    await service.reply(
      { ...target, commentId: starId, body: "Later reply" },
      service.user,
    );
    const stored = commentsFileSchema
      .parse(JSON.parse(files.get(sidecar)!))
      .threads.find((thread) => thread.id === starId)!;
    expect(stored.anchor.quote).toBe("After star rule target sentence.");
    expect(
      (await service.list(target)).threads.find(
        (thread) => thread.id === starId,
      )!.anchor.state,
    ).toBe("orphaned");
  });
  it("attach never reduces the set of replies, edits, states or anchors", async () => {
    const filler = "Filler words that give both repeats the same context.";
    const content = `# Plan\n\nShip on November 12.\n\n${filler}\n\nRepeat me.\n\n${filler}\n\nRepeat me.\n\n${filler}\n`;
    const text = visibleMarkdown(content).text;
    const span = (start: number, quote: string) =>
      makeAnchor(text, start, start + quote.length, hash(content));
    const spans = [
      span(text.indexOf("November 12"), "November 12"),
      span(text.indexOf("Ship"), "Ship"),
      span(text.indexOf("Repeat me."), "Repeat me."),
      span(text.lastIndexOf("Repeat me."), "Repeat me."),
    ];
    let seed = 7;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    type Message = {
      id: string;
      author: { kind: "user"; name: string };
      body: string;
      createdAt: string;
      editedAt: string | null;
      sentTo: { id: string; name: string }[];
    };
    type Thread = {
      id: string;
      anchor: (typeof spans)[number];
      resolvedAt: string | null;
      resolvedBy: { kind: "user"; name: string } | null;
      messages: Message[];
    };
    const message = (id: string, body: string, minute: number): Message => ({
      id,
      author: { kind: "user", name: "You" },
      body,
      createdAt: `2026-10-19T00:${String(minute).padStart(2, "0")}:00.000Z`,
      editedAt: null,
      sentTo: [],
    });
    const base: Thread = {
      id: "c_base",
      anchor: spans[0]!,
      resolvedAt: null,
      resolvedBy: null,
      messages: [message("c_base", "Root", 0)],
    };
    const mutateThread = (thread: Thread, side: string): Thread => {
      const next: Thread = structuredClone(thread);
      for (let step = 0; step < 1 + random(3); step++) {
        const operation = random(5);
        if (operation === 0)
          next.messages.push(
            message(`m_${side}${step}`, `Reply ${side}${step}`, 10 + step),
          );
        if (operation === 1 && next.messages.length) {
          const target = next.messages[random(next.messages.length)]!;
          target.body = `Edited ${side}${step}`;
          target.editedAt = "2026-10-19T01:00:00.000Z";
        }
        if (operation === 2 && next.messages.length > 1)
          next.messages.splice(1 + random(next.messages.length - 1), 1);
        if (operation === 3) {
          next.resolvedAt = next.resolvedAt ? null : "2026-10-19T02:00:00.000Z";
          next.resolvedBy = next.resolvedAt
            ? { kind: "user", name: "You" }
            : null;
        }
        if (operation === 4) next.anchor = spans[random(spans.length)]!;
      }
      return next;
    };
    const records = (
      threads: {
        messages: unknown[];
        resolvedAt: string | null;
        resolvedBy: unknown;
        anchor: unknown;
      }[],
    ) => ({
      messages: new Set(
        threads.flatMap((thread) =>
          thread.messages.map((item) => JSON.stringify(item)),
        ),
      ),
      states: new Set(
        threads.map((thread) =>
          JSON.stringify([thread.resolvedAt, thread.resolvedBy]),
        ),
      ),
      anchors: new Set(threads.map((thread) => JSON.stringify(thread.anchor))),
    });
    for (let round = 0; round < 60; round++) {
      const { service, files } = setup();
      files.set("/vault/plan.md", content);
      const destination = mutateThread(base, "d");
      const source = mutateThread(base, "s");
      files.set(
        sidecar,
        JSON.stringify({ version: 1, threads: [destination] }),
      );
      await service.attach(target, [source]);
      const after = records(
        commentsFileSchema.parse(JSON.parse(files.get(sidecar)!)).threads,
      );
      const before = records([destination, source]);
      for (const key of ["messages", "states", "anchors"] as const)
        for (const value of before[key]) expect(after[key]).toContain(value);
    }
  });
});
