import { expect, test } from "vitest";
import { uniquePull } from "../quality/trusted-policy/fork-run.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const ROOT = "repos/owner/repo";
const PAGE1 = `${ROOT}/pulls?per_page=100&page=1`;
const PAGE2 = `${ROOT}/pulls?per_page=100&page=2`;

function run(): Record<string, unknown> {
  return {
    id: 77,
    workflow_id: 2,
    event: "pull_request",
    status: "completed",
    head_sha: HEAD,
    head_branch: "feature",
    head_repository: { id: 99, full_name: "contributor/copy" },
    pull_requests: [],
  };
}

function pull(number = 1): Record<string, unknown> {
  return {
    number,
    state: "open",
    head: {
      sha: HEAD,
      ref: "feature",
      repo: { id: 99, full_name: "contributor/copy" },
    },
    base: { sha: BASE },
  };
}

function api(pulls: unknown[]): {
  read: (route: string) => Promise<unknown>;
  routes: string[];
} {
  const routes: string[] = [];
  return {
    routes,
    read: (route) => {
      routes.push(route);
      return Promise.resolve(route === PAGE1 ? pulls : []);
    },
  };
}

test("resolves one exact fork PR from a complete native inventory", async () => {
  const source = api([pull()]);
  expect(await uniquePull(source.read, ROOT, run(), 77, 2, BASE)).toBe(1);
  expect(source.routes).toEqual([PAGE1, PAGE2]);
});

test.each([
  ["state", "closed"],
  ["base", { sha: HEAD }],
  [
    "head",
    {
      sha: BASE,
      ref: "feature",
      repo: { id: 99, full_name: "contributor/copy" },
    },
  ],
  [
    "head",
    {
      sha: HEAD,
      ref: "other",
      repo: { id: 99, full_name: "contributor/copy" },
    },
  ],
  [
    "head",
    {
      sha: HEAD,
      ref: "feature",
      repo: { id: 100, full_name: "contributor/copy" },
    },
  ],
  [
    "head",
    { sha: HEAD, ref: "feature", repo: { id: 99, full_name: "other/copy" } },
  ],
] as const)("rejects a mismatched fork PR %s", async (field, value) => {
  await expect(
    uniquePull(
      api([{ ...pull(), [field]: value }]).read,
      ROOT,
      run(),
      77,
      2,
      BASE,
    ),
  ).rejects.toThrow("exactly one");
});

test("rejects missing and ambiguous fork PRs", async () => {
  await expect(
    uniquePull(api([]).read, ROOT, run(), 77, 2, BASE),
  ).rejects.toThrow("exactly one");
  await expect(
    uniquePull(api([pull(1), pull(2)]).read, ROOT, run(), 77, 2, BASE),
  ).rejects.toThrow("exactly one");
});

test.each([
  ["id", 78],
  ["workflow_id", 3],
  ["event", "push"],
  ["status", "in_progress"],
] as const)("rejects unrelated or unfinished run %s", async (field, value) => {
  await expect(
    uniquePull(
      api([pull()]).read,
      ROOT,
      { ...run(), [field]: value },
      77,
      2,
      BASE,
    ),
  ).rejects.toThrow("native completed");
});

test("rejects malformed or oversized native pages", async () => {
  await expect(
    uniquePull(api(Array(101).fill(pull())).read, ROOT, run(), 77, 2, BASE),
  ).rejects.toThrow();
  const malformed = () => Promise.resolve({ pulls: [pull()] });
  await expect(
    uniquePull(malformed, ROOT, run(), 77, 2, BASE),
  ).rejects.toThrow();
});
