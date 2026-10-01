import { expect, test } from "vitest";
import {
  jobs as nativeJobs,
  workflow as nativeWorkflow,
} from "./trusted-native-fixtures.js";
import {
  associatedRun,
  requireMatrix,
  verifyRun,
} from "../quality/trusted-policy/execution-policy.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const NAMES = new Set([
  "Full analysis (Node 22)",
  "Installed behavior (Linux, Node 22)",
  "Relentless CI gate",
]);

const workflow = (): Record<string, unknown> => nativeWorkflow(HEAD, BASE);
const jobs = (): Record<string, unknown>[] => nativeJobs(HEAD, NAMES);

function requireCurrent(
  run: unknown = workflow(),
  items: unknown[] = jobs(),
  total: unknown = 3,
): void {
  requireMatrix(run, items, 2, HEAD, NAMES, total, true);
}

test("accepts the complete current workflow matrix", () => {
  expect(() => {
    requireCurrent();
  }).not.toThrow();
  expect(verifyRun(workflow(), 2, HEAD)).toEqual(workflow());
});

test.each([
  ["workflow_id", 99],
  ["head_sha", BASE],
  ["event", "workflow_dispatch"],
  ["status", "queued"],
  ["status", "in_progress"],
  ["conclusion", "skipped"],
  ["conclusion", "cancelled"],
  ["conclusion", null],
  ["conclusion", "failure"],
] as const)("rejects unrelated or unfinished run %s %j", (field, value) => {
  expect(() => {
    requireCurrent({ ...workflow(), [field]: value });
  }).toThrow();
});

test.each([
  ["run_id", 99],
  ["run_attempt", 2],
  ["head_sha", BASE],
  ["status", "queued"],
  ["conclusion", "skipped"],
  ["conclusion", "cancelled"],
  ["conclusion", "failure"],
  ["conclusion", null],
  ["name", "forged gate"],
] as const)("rejects stale or failed job %s %j", (field, value) => {
  const items = jobs();
  items[0] = { ...items[0], [field]: value };
  expect(() => {
    requireCurrent(workflow(), items);
  }).toThrow();
});

test("rejects missing, unexpected, duplicate and partial inventories", () => {
  expect(() => {
    requireCurrent(workflow(), jobs().slice(0, -1));
  }).toThrow();
  expect(() => {
    requireCurrent(workflow(), jobs().slice(0, -1), 2);
  }).toThrow();
  expect(() => {
    requireCurrent(workflow(), [...jobs(), jobs()[0]], 4);
  }).toThrow();
  expect(() => {
    requireMatrix(workflow(), jobs(), 2, HEAD, NAMES, 3, false);
  }).toThrow("complete");
  expect(() => {
    requireMatrix(workflow(), [], 2, HEAD, new Set(), 0, true);
  }).toThrow("complete");
});

test.each(["id", "name"])("rejects duplicate native %s", (field) => {
  const items = jobs();
  items[1] = { ...items[1], [field]: items[0]?.[field] };
  expect(() => {
    requireCurrent(workflow(), items);
  }).toThrow("duplicate");
});

test("binds a native PR association to exact number, head and base", () => {
  const run = workflow();
  expect(associatedRun(run, {}, 1, HEAD, BASE)).toBe(true);
  expect(() =>
    associatedRun({ ...run, pull_requests: [] }, {}, 1, HEAD, BASE),
  ).toThrow();
  expect(
    associatedRun(
      { ...run, pull_requests: [run.pull_requests, run.pull_requests] },
      {},
      1,
      HEAD,
      BASE,
    ),
  ).toBe(false);
  for (const association of [
    { number: 2, head: { sha: HEAD }, base: { sha: BASE } },
    { number: 1, head: { sha: BASE }, base: { sha: BASE } },
    { number: 1, head: { sha: HEAD }, base: { sha: HEAD } },
  ]) {
    expect(
      associatedRun(
        { ...run, pull_requests: [association] },
        {},
        1,
        HEAD,
        BASE,
      ),
    ).toBe(false);
  }
});

test("binds a fork run with an empty native association list", () => {
  const pull = {
    number: 1,
    base: { sha: BASE },
    head: { sha: HEAD, ref: "topic", repo: { id: 7, full_name: "fork/repo" } },
  };
  const run = {
    ...workflow(),
    pull_requests: [],
    head_branch: "topic",
    head_repository: { id: 7, full_name: "fork/repo" },
  };
  expect(associatedRun(run, pull, 1, HEAD, BASE)).toBe(true);
  for (const changed of [
    { ...run, head_branch: "other" },
    { ...run, head_repository: { id: 8, full_name: "fork/repo" } },
    { ...run, head_repository: { id: 7, full_name: "other/repo" } },
  ]) {
    expect(associatedRun(changed, pull, 1, HEAD, BASE)).toBe(false);
  }
  expect(associatedRun(run, { ...pull, number: 2 }, 1, HEAD, BASE)).toBe(false);
  expect(
    associatedRun(run, { ...pull, base: { sha: HEAD } }, 1, HEAD, BASE),
  ).toBe(false);
  expect(
    associatedRun(
      run,
      { ...pull, head: { ...pull.head, sha: BASE } },
      1,
      HEAD,
      BASE,
    ),
  ).toBe(false);
});

test("rejects malformed association arrays", () => {
  expect(() =>
    associatedRun({ ...workflow(), pull_requests: null }, {}, 1, HEAD, BASE),
  ).toThrow("array");
});
