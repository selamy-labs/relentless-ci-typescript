import { expect, test } from "vitest";
import {
  resolve,
  type ReviewedPolicy,
} from "../quality/trusted-policy/issuer-resolution.js";
import type { Trigger } from "../quality/trusted-policy/trusted-event.js";

const ROOT = "repos/owner/repo";
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const REVIEWED: ReviewedPolicy = {
  repository: "owner/repo",
  repositoryId: 17,
  base: BASE,
  workflowId: 23,
  requiredNames: new Set(["full", "gate"]),
};
const COMMENT: Trigger = {
  kind: "rationale",
  repository: "owner/repo",
  repositoryId: 17,
  pullNumber: 2,
};
const COMPLETED: Trigger = { ...COMMENT, kind: "completed_run", runId: 91 };
const RUNS = `${ROOT}/actions/workflows/23/runs?per_page=100&page=1`;

function run(id: number): Record<string, unknown> {
  return {
    id,
    workflow_id: 23,
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    head_sha: HEAD,
    pull_requests: [{ number: 2, head: { sha: HEAD }, base: { sha: BASE } }],
  };
}

function source(): Record<string, unknown> {
  return {
    [ROOT]: { id: 17, full_name: "owner/repo" },
    [`${ROOT}/branches/main`]: {
      name: "main",
      protected: true,
      commit: { sha: BASE },
    },
    [`${ROOT}/pulls/2`]: { head: { sha: HEAD }, base: { sha: BASE } },
    [RUNS]: { total_count: 2, workflow_runs: [run(90), run(91)] },
    [`${ROOT}/actions/workflows/23/runs?per_page=100&page=2`]: {
      total_count: 2,
      workflow_runs: [],
    },
  };
}

function native(values: Record<string, unknown>): {
  api: (route: string) => Promise<unknown>;
  routes: string[];
} {
  const routes: string[] = [];
  return {
    routes,
    api: (route: string) => {
      routes.push(route);
      if (!(route in values)) throw new Error(`missing native route ${route}`);
      return Promise.resolve(structuredClone(values[route]));
    },
  };
}

test("rationale selects the latest current successful native run", async () => {
  const { api, routes } = native(source());
  await expect(resolve(api, COMMENT, REVIEWED)).resolves.toEqual({
    repository: "owner/repo",
    pullNumber: 2,
    head: HEAD,
    base: BASE,
    workflowId: 23,
    runId: 91,
    requiredNames: REVIEWED.requiredNames,
  });
  expect(routes).toContain(RUNS);
});

test("completed run retains event ID for native recheck", async () => {
  const { api, routes } = native(source());
  expect((await resolve(api, COMPLETED, REVIEWED)).runId).toBe(91);
  expect(routes).not.toContain(RUNS);
});

test.each([
  [ROOT, { id: 18, full_name: "owner/repo" }],
  [ROOT, { id: 17, full_name: "elsewhere/repo" }],
  [
    `${ROOT}/branches/main`,
    { name: "other", protected: true, commit: { sha: BASE } },
  ],
  [
    `${ROOT}/branches/main`,
    { name: "main", protected: false, commit: { sha: BASE } },
  ],
  [
    `${ROOT}/branches/main`,
    { name: "main", protected: true, commit: { sha: HEAD } },
  ],
  [`${ROOT}/pulls/2`, { head: { sha: HEAD }, base: { sha: HEAD } }],
] as const)("rejects changed current native route %s", async (route, value) => {
  const values = source();
  values[route] = value;
  await expect(
    resolve(native(values).api, COMMENT, REVIEWED),
  ).rejects.toThrow();
});

test.each([
  { event: "push" },
  { status: "in_progress" },
  { conclusion: "failure" },
  { head_sha: BASE },
  { workflow_id: 24 },
  { pull_requests: [] },
] as const)("rejects unrelated or failed native run %o", async (change) => {
  const values = source();
  values[RUNS] = { total_count: 1, workflow_runs: [{ ...run(91), ...change }] };
  values[`${ROOT}/actions/workflows/23/runs?per_page=100&page=2`] = {
    total_count: 1,
    workflow_runs: [],
  };
  await expect(
    resolve(native(values).api, COMMENT, REVIEWED),
  ).rejects.toThrow();
});

test("rejects trigger identity and empty matrix", async () => {
  const { api } = native(source());
  await expect(
    resolve(api, { ...COMMENT, repository: "other/repo" }, REVIEWED),
  ).rejects.toThrow();
  await expect(
    resolve(api, { ...COMMENT, repositoryId: 18 }, REVIEWED),
  ).rejects.toThrow();
  await expect(
    resolve(api, COMMENT, { ...REVIEWED, requiredNames: new Set() }),
  ).rejects.toThrow();
});

test("incomplete run inventory fails closed", async () => {
  const values = source();
  values[RUNS] = { total_count: 3, workflow_runs: [run(90), run(91)] };
  await expect(
    resolve(native(values).api, COMMENT, REVIEWED),
  ).rejects.toThrow();
});

test("association-free fork event resolves one current PR", async () => {
  const values = source();
  values[`${ROOT}/actions/runs/91`] = {
    id: 91,
    workflow_id: 23,
    event: "pull_request",
    status: "completed",
    head_sha: HEAD,
    head_branch: "feature",
    head_repository: { id: 31, full_name: "contributor/fork" },
  };
  values[`${ROOT}/pulls?per_page=100&page=1`] = [
    {
      number: 2,
      state: "open",
      base: { sha: BASE },
      head: {
        sha: HEAD,
        ref: "feature",
        repo: { id: 31, full_name: "contributor/fork" },
      },
    },
  ];
  values[`${ROOT}/pulls?per_page=100&page=2`] = [];
  const trigger: Trigger = {
    kind: "completed_run",
    repository: "owner/repo",
    repositoryId: 17,
    runId: 91,
  };
  expect(
    (await resolve(native(values).api, trigger, REVIEWED)).pullNumber,
  ).toBe(2);
});

test("missing pull and run identifiers fail closed", async () => {
  const { api } = native(source());
  await expect(
    resolve(
      api,
      { kind: "rationale", repository: "owner/repo", repositoryId: 17 },
      REVIEWED,
    ),
  ).rejects.toThrow();
  await expect(
    resolve(api, { ...COMMENT, kind: "completed_run" }, REVIEWED),
  ).rejects.toThrow();
});
