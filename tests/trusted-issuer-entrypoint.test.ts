import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { Execute } from "../quality/trusted-policy/check-transport.js";
import {
  appId,
  eventPayload,
  main,
  requiredNames,
  reviewedPolicy,
} from "../quality/trusted-policy/issuer-entrypoint.js";
import { record } from "../quality/trusted-policy/review-fields.js";
import { nativeMap } from "./trusted-native-fixtures.js";

const ROOT = "repos/owner/repo";
const BASE = "b".repeat(40);
const HEAD = "a".repeat(40);
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});

function eventFile(): string {
  const folder = mkdtempSync(join(tmpdir(), "trusted-entrypoint-"));
  folders.push(folder);
  const path = join(folder, "event.json");
  writeFileSync(
    path,
    JSON.stringify({
      repository: { full_name: "owner/repo", id: 17 },
      action: "created",
      issue: { number: 1, pull_request: { url: "native" } },
    }),
  );
  return path;
}

function source(): Map<string, unknown> {
  return new Map([
    [ROOT, { id: 17, full_name: "owner/repo", default_branch: "main" }],
    [
      `${ROOT}/branches/main`,
      { name: "main", protected: true, commit: { sha: BASE } },
    ],
    [
      `${ROOT}/actions/workflows/ci.yml`,
      {
        id: 2,
        name: "Relentless CI",
        path: ".github/workflows/ci.yml",
        state: "active",
      },
    ],
    [`${ROOT}/pulls/1`, { head: { sha: HEAD }, base: { sha: BASE } }],
    [
      `${ROOT}/actions/workflows/2/runs?per_page=100&page=1`,
      { total_count: 0, workflow_runs: [] },
    ],
  ]);
}

test("compiles the fixed 13-job TypeScript matrix", () => {
  const names = requiredNames();
  expect(names.size).toBe(13);
  expect(names).toContain("Relentless CI gate");
  expect(names).toContain("Full analysis (Node 26)");
  expect(names).toContain("Installed behavior (windows-2025, Node 22)");
  expect(names).toContain("Installed behavior (macos-15, Node 24)");
});

test("compiles workflow and protected base from native state", async () => {
  await expect(
    reviewedPolicy(nativeMap(source()), "owner/repo", BASE),
  ).resolves.toEqual({
    repository: "owner/repo",
    repositoryId: 17,
    base: BASE,
    workflowId: 2,
    requiredNames: requiredNames(),
  });
});

test.each([
  [
    ROOT,
    "full_name",
    "other/repo",
    "issuer repository identity or default branch changed",
  ],
  [
    ROOT,
    "default_branch",
    "trunk",
    "issuer repository identity or default branch changed",
  ],
  [
    `${ROOT}/branches/main`,
    "name",
    "elsewhere",
    "issuer did not run from current protected main",
  ],
  [
    `${ROOT}/branches/main`,
    "protected",
    false,
    "issuer did not run from current protected main",
  ],
  [
    `${ROOT}/branches/main`,
    "commit",
    { sha: HEAD },
    "issuer did not run from current protected main",
  ],
  [
    `${ROOT}/actions/workflows/ci.yml`,
    "name",
    "Other CI",
    "required CI workflow identity differs",
  ],
  [
    `${ROOT}/actions/workflows/ci.yml`,
    "path",
    "ci-other.yml",
    "required CI workflow identity differs",
  ],
  [
    `${ROOT}/actions/workflows/ci.yml`,
    "state",
    "disabled_manually",
    "required CI workflow identity differs",
  ],
] as const)(
  "rejects changed protected %s field %s",
  async (route, field, value, reason) => {
    const values = source();
    values.set(route, { ...record(values.get(route)), [field]: value });
    await expect(
      reviewedPolicy(nativeMap(values), "owner/repo", BASE),
    ).rejects.toThrow(reason);
  },
);

test("event payload accepts bounded absolute native JSON and rejects duplicates", () => {
  const path = eventFile();
  expect(record(eventPayload(path)).action).toBe("created");
  writeFileSync(path, '{"action":"created","action":"deleted"}');
  expect(() => eventPayload(path)).toThrow("duplicate");
});

test("event payload rejects relative, missing, nonfile, and oversized paths", () => {
  const path = eventFile();
  expect(() => eventPayload("event.json")).toThrow("absolute");
  expect(() => eventPayload(`${path}.missing`)).toThrow();
  expect(() => eventPayload(join(path, "child"))).toThrow();
  truncateSync(path, 8 * 1024 * 1024 + 1);
  expect(() => eventPayload(path)).toThrow(
    "trusted event file is missing or too large",
  );
});

test("event payload accepts the exact native byte budget", () => {
  const path = eventFile();
  writeFileSync(path, "{}" + " ".repeat(8 * 1024 * 1024 - 2));
  expect(eventPayload(path)).toEqual({});
});

test.each(["0", "-2", "+2", "two", "2.0", "9007199254740993"])(
  "rejects invalid App ID %s",
  (value) => {
    expect(() => appId(value)).toThrow();
  },
);

test("accepts an exact positive App ID", () => {
  expect(appId("41")).toBe(41);
  expect(appId("5155288")).toBe(5155288);
});

test("reports a malformed dedicated App ID before conversion", () => {
  expect(() => appId("two")).toThrow(
    "dedicated App ID is not a positive decimal identity",
  );
});

test("entrypoint requires installation token before native reads", async () => {
  const execute = vi.fn(() => Buffer.from("{}")) as unknown as Execute;
  const env = {
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_SHA: BASE,
    GITHUB_EVENT_NAME: "issue_comment",
    GITHUB_EVENT_PATH: eventFile(),
    RELENTLESS_POLICY_APP_ID: "41",
  };
  await expect(main(env, "/trusted/gh", execute)).rejects.toThrow(
    "installation token",
  );
  expect(execute).not.toHaveBeenCalled();
});

test("entrypoint publishes a native App-owned failure when the required run is absent", async () => {
  const values = source();
  const calls: string[] = [];
  const execute = vi.fn((_file: unknown, args: unknown, options: unknown) => {
    const parts = args as string[];
    const route = parts.at(-1);
    if (route === undefined) throw new Error("missing native route");
    calls.push(route);
    if (parts.includes("POST")) {
      const input = record(JSON.parse(String(record(options).input)));
      return Buffer.from(JSON.stringify({ ...input, id: 77, app: { id: 41 } }));
    }
    if (route === `${ROOT}/check-runs/77`) {
      return Buffer.from(
        JSON.stringify({
          id: 77,
          name: "Relentless trusted policy",
          head_sha: HEAD,
          status: "completed",
          conclusion: "failure",
          app: { id: 41 },
        }),
      );
    }
    if (!values.has(route)) throw new Error(`unexpected native route ${route}`);
    return Buffer.from(JSON.stringify(values.get(route)));
  }) as unknown as Execute;
  const env = {
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_SHA: BASE,
    GITHUB_EVENT_NAME: "issue_comment",
    GITHUB_EVENT_PATH: eventFile(),
    RELENTLESS_POLICY_APP_ID: "41",
    GH_TOKEN: "test-only-installation-token",
  };
  await expect(main(env, "/trusted/gh", execute)).resolves.toBe(77);
  expect(calls).toContain(`${ROOT}/check-runs`);
  expect(calls).toContain(`${ROOT}/check-runs/77`);
});
