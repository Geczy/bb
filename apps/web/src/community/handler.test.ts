import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "@bb/connect-db";
import { applyConnectDbMigrationsToD1 } from "@bb/connect-db/testing";
import { handleCommunityForm } from "./handler";
import { SOLD_OUT } from "./survey";

let runtime: Miniflare;
let db: D1Database;
const origin = "https://community.test";
const codeFrom = (html: string) => html.match(/merch\?c=([a-z0-9]+)/)?.[1];
const enabled = () => ({
  DB: db,
  COMMUNITY_FORMS_ENABLED: "true",
  COMMUNITY_FORM_RATE_LIMITER: { limit: async () => ({ success: true }) },
});
const submit = (
  id = crypto.randomUUID(),
  fields: Record<string, string> = {},
) =>
  handleCommunityForm(
    new Request(`${origin}/community/survey`, {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({ submission_id: id, ...fields }),
    }),
    enabled(),
    "survey",
  );

beforeAll(async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } }",
    d1Databases: ["DB"],
    compatibilityDate: "2026-06-11",
  });
  db = (await runtime.getD1Database("DB")) as unknown as D1Database;
  await applyConnectDbMigrationsToD1(db);
});
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM community_survey_response"),
    db.prepare("DELETE FROM community_sticker_code"),
  ]);
});
afterAll(async () => {
  await runtime?.dispose();
});

describe("private community forms", () => {
  it("keeps collection off and refuses addresses", async () => {
    const response = await handleCommunityForm(
      new Request(`${origin}/community/survey`, { method: "POST" }),
      { DB: db },
      "survey",
    );
    expect(response.status).toBe(503);
    const merch = await handleCommunityForm(
      new Request(`${origin}/community/merch`, {
        method: "POST",
        body: "address=private",
      }),
      enabled(),
      "merch",
    );
    expect(merch.status).toBe(405);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM community_survey_response")
        .first("n"),
    ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'community_merch_address'",
        )
        .first(),
    ).toBeNull();
  });
  it("allocates one hashed code per new submission without storing it with answers", async () => {
    const id = crypto.randomUUID();
    const html = await (await submit(id)).text();
    const code = codeFrom(html)!;
    expect(code).toMatch(/^[a-f0-9]{32}$/);
    expect(
      await db
        .prepare("SELECT answers FROM community_survey_response WHERE id = ?")
        .bind(id)
        .first("answers"),
    ).toBe("{}");
    expect(
      await db
        .prepare("SELECT code_hash FROM community_sticker_code")
        .first("code_hash"),
    ).toBe(await sha256Hex(code));
    const repeat = await (await submit(id)).text();
    expect(codeFrom(repeat)).toBeUndefined();
    expect(repeat).toContain("we already have your answers");
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM community_sticker_code")
        .first("n"),
    ).toBe(1);
  });
  it("caps concurrent allocations at 250 and still accepts answers when sold out", async () => {
    await db.batch(
      Array.from({ length: 249 }, (_, index) =>
        db
          .prepare(
            "INSERT INTO community_sticker_code (slot, code_hash) VALUES (?, ?)",
          )
          .bind(index + 1, `seed-${index}`),
      ),
    );
    const responses = await Promise.all(
      Array.from({ length: 4 }, async () => (await submit()).text()),
    );
    expect(responses.filter(codeFrom)).toHaveLength(1);
    expect(
      responses.filter((html) =>
        html.includes(SOLD_OUT.replaceAll("'", "&#x27;")),
      ),
    ).toHaveLength(3);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM community_sticker_code")
        .first("n"),
    ).toBe(250);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM community_survey_response")
        .first("n"),
    ).toBe(4);
  });
  it("rolls back answers when allocating a code fails", async () => {
    await db
      .prepare(
        "CREATE TRIGGER reject_code BEFORE INSERT ON community_sticker_code BEGIN SELECT RAISE(ABORT, 'unavailable'); END",
      )
      .run();
    try {
      expect((await submit()).status).toBe(503);
      expect(
        await db
          .prepare("SELECT COUNT(*) AS n FROM community_survey_response")
          .first("n"),
      ).toBe(0);
    } finally {
      await db.prepare("DROP TRIGGER reject_code").run();
    }
  });
  it("validates issued codes, preserves them across visits, and revokes shipped codes", async () => {
    const code = codeFrom(await (await submit()).text())!;
    const request = () => new Request(`${origin}/community/merch?c=${code}`);
    const empty = await handleCommunityForm(request(), enabled(), "merch");
    expect(await empty.text()).toContain(
      "private mailing form isn&#x27;t open yet",
    );
    const formEnv = {
      ...enabled(),
      COMMUNITY_JOTFORM_URL: "https://form.jotform.com/123456",
    };
    for (let index = 0; index < 2; index++) {
      const response = await handleCommunityForm(request(), formEnv, "merch");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        `https://form.jotform.com/123456?code=${code}`,
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    const off = await handleCommunityForm(
      request(),
      { ...formEnv, COMMUNITY_FORMS_ENABLED: "false" },
      "merch",
    );
    expect(await off.text()).not.toContain("<iframe");
    const unsafe = await handleCommunityForm(
      request(),
      { ...formEnv, COMMUNITY_JOTFORM_URL: "https://attacker.example/form" },
      "merch",
    );
    expect(await unsafe.text()).not.toContain("<iframe");
    await db
      .prepare(
        "UPDATE community_sticker_code SET shipped = 1 WHERE code_hash = ?",
      )
      .bind(await sha256Hex(code))
      .run();
    expect(
      (await handleCommunityForm(request(), formEnv, "merch")).status,
    ).toBe(404);
  });
  it("rejects unknown codes, validates contributor hashes and ignores legacy raw invites", async () => {
    const code = "contributor-code-128-bits-fixture";
    const request = new Request(`${origin}/community/merch?c=${code}`);
    expect(
      (await handleCommunityForm(request, enabled(), "merch")).status,
    ).toBe(404);
    expect(
      (
        await handleCommunityForm(
          request,
          {
            ...enabled(),
            COMMUNITY_MERCH_INVITE_HASHES: JSON.stringify([
              await sha256Hex(code),
            ]),
          },
          "merch",
        )
      ).status,
    ).toBe(200);
  });
});
