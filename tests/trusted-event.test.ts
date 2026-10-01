import { expect, test } from "vitest";
import { parseEvent } from "../quality/trusted-policy/trusted-event.js";

const NAME = "selamy-labs/relentless-ci-typescript";
const IDENTITY = 1234;

function comment(): Record<string, unknown> {
  return {
    repository: { full_name: NAME, id: IDENTITY },
    action: "created",
    issue: { number: 2, pull_request: { url: "native" } },
  };
}

function run(): Record<string, unknown> {
  return {
    repository: { full_name: NAME, id: IDENTITY },
    action: "completed",
    workflow_run: {
      id: 77,
      event: "pull_request",
      pull_requests: [{ number: 2 }],
    },
  };
}

function dispatch(): Record<string, unknown> {
  return {
    repository: { full_name: NAME, id: IDENTITY },
    action: "relentless-policy-reevaluate",
    client_payload: { pull_number: 2 },
  };
}

test("dispatch contains only a PR lookup number", () => {
  expect(parseEvent("repository_dispatch", dispatch(), NAME, IDENTITY)).toEqual(
    {
      kind: "dispatch",
      repository: NAME,
      repositoryId: IDENTITY,
      pullNumber: 2,
    },
  );
});

test.each([
  { action: "other" },
  { client_payload: {} },
  { client_payload: { pull_number: 0 } },
  { client_payload: { pull_number: 2, verdict: "pass" } },
  { client_payload: { pull_number: 2, head: "a".repeat(40) } },
  { client_payload: { pull_number: "2" } },
])("rejects dispatch fields beyond a valid lookup number", (changed) => {
  expect(() =>
    parseEvent(
      "repository_dispatch",
      { ...dispatch(), ...changed },
      NAME,
      IDENTITY,
    ),
  ).toThrow();
});

test.each(["created", "edited", "deleted"])(
  "treats %s as a request to reread current rationale",
  (action) => {
    expect(
      parseEvent("issue_comment", { ...comment(), action }, NAME, IDENTITY),
    ).toEqual({
      kind: "rationale",
      repository: NAME,
      repositoryId: IDENTITY,
      pullNumber: 2,
    });
  },
);

test("accepts only completed run identifiers and defers unassociated forks", () => {
  expect(parseEvent("workflow_run", run(), NAME, IDENTITY)).toEqual({
    kind: "completed_run",
    repository: NAME,
    repositoryId: IDENTITY,
    pullNumber: 2,
    runId: 77,
  });
  const event = run();
  event.workflow_run = { id: 77, event: "pull_request", pull_requests: [] };
  expect(parseEvent("workflow_run", event, NAME, IDENTITY)).toEqual({
    kind: "completed_run",
    repository: NAME,
    repositoryId: IDENTITY,
    runId: 77,
  });
});

test.each([
  ["issue_comment", "action", "transferred"],
  ["issue_comment", "issue", { number: 2 }],
  ["issue_comment", "issue", { number: 0, pull_request: {} }],
  ["workflow_run", "action", "requested"],
  [
    "workflow_run",
    "workflow_run",
    { id: 77, event: "push", pull_requests: [{ number: 2 }] },
  ],
  [
    "workflow_run",
    "workflow_run",
    {
      id: 77,
      event: "pull_request",
      pull_requests: [{ number: 2 }, { number: 3 }],
    },
  ],
  [
    "workflow_run",
    "workflow_run",
    { id: 0, event: "pull_request", pull_requests: [{ number: 2 }] },
  ],
  [
    "workflow_run",
    "workflow_run",
    { id: 77, event: "pull_request", pull_requests: null },
  ],
] as const)("rejects event %s with changed %s", (name, field, value) => {
  const source = name === "issue_comment" ? comment() : run();
  expect(() =>
    parseEvent(name, { ...source, [field]: value }, NAME, IDENTITY),
  ).toThrow();
});

test.each([
  ["full_name", "other/repo"],
  ["id", 999],
  ["id", true],
] as const)("requires exact repository %s", (field, value) => {
  const source = comment();
  expect(() =>
    parseEvent(
      "issue_comment",
      {
        ...source,
        repository: { full_name: NAME, id: IDENTITY, [field]: value },
      },
      NAME,
      IDENTITY,
    ),
  ).toThrow();
});

test("rejects unsupported trusted events", () => {
  expect(() =>
    parseEvent("pull_request_review", comment(), NAME, IDENTITY),
  ).toThrow("unsupported trusted issuer event");
});
