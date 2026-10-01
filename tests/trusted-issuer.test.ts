import { expect, test } from "vitest";
import {
  nativeMap,
  pull as nativePull,
  workflow as nativeWorkflow,
} from "./trusted-native-fixtures.js";
import type { ReviewedPolicy } from "../quality/trusted-policy/issuer-resolution.js";
import { issue } from "../quality/trusted-policy/trusted-issuer.js";

const ROOT = "repos/owner/repo";
const PR = `${ROOT}/pulls/1`;
const RUN = `${ROOT}/actions/runs/1`;
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const NAMES = new Set(["Full analysis", "Installed behavior", "Gate"]);
const REVIEWED: ReviewedPolicy = {
  repository: "owner/repo",
  repositoryId: 17,
  base: BASE,
  workflowId: 2,
  requiredNames: NAMES,
};

const workflow = (conclusion = "success"): Record<string, unknown> =>
  nativeWorkflow(HEAD, BASE, conclusion);

function source(): Map<string, unknown> {
  const issueUrl = `https://api.github.com/${ROOT}/issues/1`;
  return new Map<string, unknown>([
    [ROOT, { id: 17, full_name: "owner/repo" }],
    [
      `${ROOT}/branches/main`,
      { name: "main", protected: true, commit: { sha: BASE } },
    ],
    [PR, nativePull(HEAD, BASE)],
    [
      `${PR}/commits?per_page=100&page=1`,
      [{ sha: HEAD, author: { id: 1 }, committer: { id: 4 } }],
    ],
    [`${PR}/commits?per_page=100&page=2`, []],
    [
      `${PR}/reviews?per_page=100&page=1`,
      [
        {
          id: 10,
          user: { id: 2, login: "user-2" },
          state: "APPROVED",
          submitted_at: "2026-09-29T15:00:00Z",
          commit_id: HEAD,
          body: `Policy rationale: ${"x".repeat(30)}`,
        },
      ],
    ],
    [`${PR}/reviews?per_page=100&page=2`, []],
    [
      `${ROOT}/collaborators/user-2/permission`,
      { user: { id: 2, login: "user-2" }, role_name: "maintain" },
    ],
    [
      `${ROOT}/issues/1/comments?per_page=100&page=1`,
      [
        {
          id: 9,
          user: { id: 2 },
          issue_url: issueUrl,
          body: `Policy rationale for ${HEAD}: Complete mutation scope stays protected.`,
        },
      ],
    ],
    [`${ROOT}/issues/1/comments?per_page=100&page=2`, []],
    [RUN, workflow()],
    [
      `${RUN}/attempts/3/jobs?per_page=100&page=1`,
      {
        total_count: 3,
        jobs: [...NAMES].map((name, index) => ({
          id: index + 1,
          run_id: 1,
          run_attempt: 3,
          head_sha: HEAD,
          name,
          status: "completed",
          conclusion: "success",
        })),
      },
    ],
    [
      `${RUN}/attempts/3/jobs?per_page=100&page=2`,
      { total_count: 3, jobs: [] },
    ],
    [
      `${ROOT}/actions/workflows/2/runs?per_page=100&page=1`,
      { total_count: 1, workflow_runs: [workflow()] },
    ],
    [
      `${ROOT}/actions/workflows/2/runs?per_page=100&page=2`,
      { total_count: 1, workflow_runs: [] },
    ],
  ]);
}

function event(): Record<string, unknown> {
  return {
    repository: { full_name: "owner/repo", id: 17 },
    action: "created",
    issue: { number: 1, pull_request: { url: "native" } },
  };
}

function publisher(): {
  publish: (head: string, passed: boolean) => Promise<number>;
  decisions: [string, boolean][];
} {
  const decisions: [string, boolean][] = [];
  return {
    decisions,
    publish: (head, passed) => {
      decisions.push([head, passed]);
      return Promise.resolve(decisions.length);
    },
  };
}

async function expectFailure(values: Map<string, unknown>): Promise<void> {
  const { publish, decisions } = publisher();
  expect(
    await issue(nativeMap(values), publish, "issue_comment", event(), REVIEWED),
  ).toBe(1);
  expect(decisions).toEqual([[HEAD, false]]);
}

test("publishes failure first, then success only after current native approval", async () => {
  const { publish, decisions } = publisher();
  expect(
    await issue(
      nativeMap(source()),
      publish,
      "issue_comment",
      event(),
      REVIEWED,
    ),
  ).toBe(2);
  expect(decisions).toEqual([
    [HEAD, false],
    [HEAD, true],
  ]);
});

test("missing current run replaces stale success with failure", async () => {
  const values = source();
  values.set(`${ROOT}/actions/workflows/2/runs?per_page=100&page=1`, {
    total_count: 0,
    workflow_runs: [],
  });
  await expectFailure(values);
});

test("invalid current review leaves only the App failure check", async () => {
  const values = source();
  values.set(`${PR}/reviews?per_page=100&page=1`, []);
  await expectFailure(values);
});

test("untrusted event identity cannot publish", async () => {
  const { publish, decisions } = publisher();
  const foreign = {
    ...event(),
    repository: { full_name: "other/repo", id: 17 },
  };
  await expect(
    issue(nativeMap(source()), publish, "issue_comment", foreign, REVIEWED),
  ).rejects.toThrow();
  expect(decisions).toEqual([]);
});

test("association-free event has no safe fallback when resolution fails", async () => {
  const { publish, decisions } = publisher();
  const values = source();
  values.set(`${ROOT}/pulls?per_page=100&page=1`, []);
  const unknown = {
    repository: { full_name: "owner/repo", id: 17 },
    action: "completed",
    workflow_run: { id: 1, event: "pull_request", pull_requests: [] },
  };
  await expect(
    issue(nativeMap(values), publish, "workflow_run", unknown, REVIEWED),
  ).rejects.toThrow("fork run does not identify exactly one current PR");
  expect(decisions).toEqual([]);
});

test("failure-check creation must precede success", async () => {
  const publish = (): Promise<number> =>
    Promise.reject(new Error("App publication failed"));
  await expect(
    issue(nativeMap(source()), publish, "issue_comment", event(), REVIEWED),
  ).rejects.toThrow("App publication failed");
});
