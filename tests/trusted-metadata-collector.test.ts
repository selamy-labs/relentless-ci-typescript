import { expect, test } from "vitest";
import {
  jobs as nativeJobs,
  pull as nativePull,
  workflow as nativeWorkflow,
} from "./trusted-native-fixtures.js";
import {
  evaluate,
  evaluateComment,
  type Policy,
} from "../quality/trusted-policy/metadata-collector.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const REPOSITORY = "repos/owner/repo";
const PR = `${REPOSITORY}/pulls/1`;
const RUN = `${REPOSITORY}/actions/runs/1`;
const COMMENT_ROUTE = `${REPOSITORY}/issues/1/comments`;
const ISSUE_URL = `https://api.github.com/${REPOSITORY}/issues/1`;
const NAMES = new Set([
  "Full analysis (Node 22)",
  "Installed behavior (Linux, Node 22)",
  "Relentless CI gate",
]);
const POLICY: Policy = {
  repository: "owner/repo",
  pullNumber: 1,
  head: HEAD,
  base: BASE,
  workflowId: 2,
  runId: 1,
  requiredNames: NAMES,
};

const pull = (): Record<string, unknown> => nativePull(HEAD, BASE);

function review(state = "APPROVED"): Record<string, unknown> {
  return {
    id: 10,
    user: { id: 2, login: "user-2" },
    state,
    submitted_at: "2026-09-29T15:00:00Z",
    commit_id: HEAD,
    body: `Policy rationale: ${"x".repeat(30)}`,
  };
}

function role(name = "maintain"): Record<string, unknown> {
  return { user: { id: 2, login: "user-2" }, role_name: name };
}

const workflow = (): Record<string, unknown> => nativeWorkflow(HEAD, BASE);
const jobs = (): Record<string, unknown>[] => nativeJobs(HEAD, NAMES);

type Pages = Map<string, unknown[]>;

function source(): Pages {
  return new Map([
    [PR, [pull()]],
    [
      `${PR}/commits?per_page=100&page=1`,
      [[{ sha: HEAD, author: { id: 1 }, committer: { id: 4 } }]],
    ],
    [`${PR}/commits?per_page=100&page=2`, [[]]],
    [`${PR}/reviews?per_page=100&page=1`, [[review()]]],
    [`${PR}/reviews?per_page=100&page=2`, [[]]],
    [`${REPOSITORY}/collaborators/user-2/permission`, [role()]],
    [
      `${COMMENT_ROUTE}?per_page=100&page=1`,
      [
        [
          {
            id: 9,
            user: { id: 2 },
            issue_url: ISSUE_URL,
            body: `Policy rationale for ${HEAD}: Complete mutation scope stays protected.`,
          },
        ],
      ],
    ],
    [`${COMMENT_ROUTE}?per_page=100&page=2`, [[]]],
    [RUN, [workflow()]],
    [
      `${RUN}/attempts/3/jobs?per_page=100&page=1`,
      [{ total_count: 3, jobs: jobs() }],
    ],
    [
      `${RUN}/attempts/3/jobs?per_page=100&page=2`,
      [{ total_count: 3, jobs: [] }],
    ],
  ]);
}

function native(values: Pages): {
  api: (route: string) => Promise<unknown>;
  routes: string[];
} {
  const routes: string[] = [];
  return {
    routes,
    api: (route: string) => {
      routes.push(route);
      const responses = values.get(route);
      if (responses === undefined || responses.length === 0) {
        throw new Error(`unexpected native route ${route}`);
      }
      const value = responses.length > 1 ? responses.shift() : responses[0];
      return Promise.resolve(structuredClone(value));
    },
  };
}

test("collects complete native approval and matrix evidence with readback", async () => {
  const { api, routes } = native(source());
  expect(await evaluate(api, POLICY)).toBe(2);
  expect(routes.filter((route) => route === PR)).toHaveLength(2);
  expect(routes.filter((route) => route === RUN)).toHaveLength(2);
  expect(
    routes.filter((route) => route.endsWith("reviews?per_page=100&page=2")),
  ).toHaveLength(2);
});

test.each([BASE, null, "not-a-commit"])(
  "rejects changed native candidate head %j",
  async (head) => {
    const values = source();
    values.set(PR, [{ ...pull(), head: { sha: head } }]);
    await expect(evaluate(native(values).api, POLICY)).rejects.toThrow();
  },
);

test.each([
  ["number", 2],
  ["head", { sha: BASE }],
  ["base", { sha: HEAD }],
] as const)("rejects unrelated run association %s", async (field, value) => {
  const values = source();
  values.set(RUN, [
    {
      ...workflow(),
      pull_requests: [
        { number: 1, head: { sha: HEAD }, base: { sha: BASE }, [field]: value },
      ],
    },
  ]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "associated",
  );
});

test("rejects a run associated with multiple PRs", async () => {
  const values = source();
  const association = { number: 1, head: { sha: HEAD }, base: { sha: BASE } };
  values.set(RUN, [
    { ...workflow(), pull_requests: [association, association] },
  ]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "associated",
  );
});

test("detects a changing candidate or workflow run", async () => {
  const values = source();
  values.set(PR, [pull(), { ...pull(), merge_commit_sha: HEAD }]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "candidate metadata changed",
  );
  const other = source();
  other.set(RUN, [workflow(), { ...workflow(), run_attempt: 4 }]);
  await expect(evaluate(native(other).api, POLICY)).rejects.toThrow(
    "workflow run changed",
  );
});

test.each([
  "../repo",
  "owner/repo?x=1",
  "a/b/c",
  "a b/r",
  "https://evil/repo",
  "a/.",
  "a/..",
])("rejects unsafe repository %s", async (repository) => {
  await expect(
    evaluate(native(source()).api, { ...POLICY, repository }),
  ).rejects.toThrow();
});

test.each([
  ["state", "closed"],
  ["commits", 2],
] as const)("rejects changed candidate readback %s", async (field, value) => {
  const values = source();
  values.set(PR, [pull(), { ...pull(), [field]: value }]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow();
});

test("rejects review revocation during collection", async () => {
  const values = source();
  values.set(`${PR}/reviews?per_page=100&page=1`, [
    [review()],
    [review("DISMISSED")],
  ]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "review inventory changed",
  );
});

test("rejects unsafe reviewer login and incomplete commit inventory", async () => {
  const values = source();
  values.set(`${PR}/reviews?per_page=100&page=1`, [
    [{ ...review(), user: { id: 2, login: "user-2/../attacker" } }],
  ]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "safe path",
  );
  const other = source();
  other.set(`${PR}/commits?per_page=100&page=1`, [[]]);
  await expect(evaluate(native(other).api, POLICY)).rejects.toThrow(
    "commit inventory",
  );
});

test("rejects reviewer role removal during collection", async () => {
  const values = source();
  values.set(`${REPOSITORY}/collaborators/user-2/permission`, [
    role(),
    role("read"),
  ]);
  await expect(evaluate(native(values).api, POLICY)).rejects.toThrow(
    "roles changed",
  );
});

test("accepts independent approval with a separate current-head comment", async () => {
  const values = source();
  values.set(`${PR}/reviews?per_page=100&page=1`, [
    [{ ...review(), body: "" }],
  ]);
  const { api, routes } = native(values);
  expect(await evaluateComment(api, POLICY)).toBe(2);
  expect(
    routes.filter((route) => route === `${COMMENT_ROUTE}?per_page=100&page=2`),
  ).toHaveLength(2);
});

test("rejects a missing or stale comment rationale", async () => {
  const missing = source();
  missing.set(`${COMMENT_ROUTE}?per_page=100&page=1`, [[]]);
  await expect(evaluateComment(native(missing).api, POLICY)).rejects.toThrow(
    "missing",
  );
  const stale = source();
  stale.set(`${COMMENT_ROUTE}?per_page=100&page=1`, [
    [
      {
        id: 9,
        user: { id: 2 },
        issue_url: ISSUE_URL,
        body: `Policy rationale for ${BASE}: Complete mutation scope stays protected.`,
      },
    ],
  ]);
  await expect(evaluateComment(native(stale).api, POLICY)).rejects.toThrow(
    "missing",
  );
});

test("rejects comment changes during the native readback", async () => {
  const values = source();
  values.set(`${COMMENT_ROUTE}?per_page=100&page=1`, [
    [
      {
        id: 9,
        user: { id: 2 },
        issue_url: ISSUE_URL,
        body: `Policy rationale for ${HEAD}: Complete mutation scope stays protected.`,
      },
    ],
    [
      {
        id: 9,
        user: { id: 2 },
        issue_url: ISSUE_URL,
        body: `Policy rationale for ${HEAD}: Different adequate rationale remains protected.`,
      },
    ],
  ]);
  await expect(evaluateComment(native(values).api, POLICY)).rejects.toThrow(
    "comment inventory changed",
  );
});
