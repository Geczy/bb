import { describe, expect, it } from "vitest";
import { splitDestination, splitStem } from "./destination-label.js";

describe("splitDestination", () => {
  it.each([
    [
      "/srv/app/credentials/.env.local",
      { stem: ".env", extension: ".local", folder: "/srv/app/credentials" },
    ],
    [
      "/srv/credentials/droplet-monitor-production-service.env.local",
      {
        stem: "droplet-monitor-production-service",
        extension: ".env.local",
        folder: "/srv/credentials",
      },
    ],
    ["/srv/app/.env", { stem: ".env", extension: "", folder: "/srv/app" }],
    [
      "/srv/app/.env.production.local",
      { stem: ".env", extension: ".production.local", folder: "/srv/app" },
    ],
    [
      "/srv/app/api.env.production.local",
      { stem: "api", extension: ".env.production.local", folder: "/srv/app" },
    ],
    ["/.env", { stem: ".env", extension: "", folder: "/" }],
    ["C:\\app\\.env", { stem: ".env", extension: "", folder: "C:\\app" }],
    ["C:\\.env", { stem: ".env", extension: "", folder: "C:\\" }],
    ["/srv/app/", { stem: "/srv/app/", extension: "", folder: null }],
    ["secrets.env", { stem: "secrets", extension: ".env", folder: null }],
    [
      "/srv/app/config.prod.json",
      { stem: "config.prod", extension: ".json", folder: "/srv/app" },
    ],
  ])("splits %s", (path, parts) => {
    expect(splitDestination(path)).toEqual(parts);
  });
});

describe("splitStem", () => {
  it.each([
    [".env", { head: ".env", tail: "" }],
    ["service-acct", { head: "service-acct", tail: "" }],
    [
      "droplet-monitor-production-service",
      { head: "droplet-monitor-production-s", tail: "ervice" },
    ],
    ["credenciales-producción", { head: "credenciales-prod", tail: "ucción" }],
    [
      "my-production-cafe\u0301-key1",
      { head: "my-production-caf", tail: "e\u0301-key1" },
    ],
    [
      "team-credentials-\u{1F468}\u200D\u{1F469}\u200D\u{1F467}-ok",
      {
        head: "team-credential",
        tail: "s-\u{1F468}\u200D\u{1F469}\u200D\u{1F467}-ok",
      },
    ],
  ])("keeps the end of %s whole", (stem, parts) => {
    expect(splitStem(stem)).toEqual(parts);
    expect(parts.head + parts.tail).toBe(stem);
  });
});
