/** Resolve trusted triggers against current native PR, base, and run state. */

import { associatedRun } from "./execution-policy.js";
import { uniquePull } from "./fork-run.js";
import { repositoryRoute } from "./github-read.js";
import type { Policy } from "./metadata-collector.js";
import { objectInventory, type ReadApi } from "./metadata-pages.js";
import { digest, identifier, record } from "./review-fields.js";
import type { Trigger } from "./trusted-event.js";

type Native = Record<string, unknown>;

export interface ReviewedPolicy {
  repository: string;
  repositoryId: number;
  base: string;
  workflowId: number;
  requiredNames: Set<string>;
}

async function currentCandidate(
  api: ReadApi,
  number: number,
  reviewed: ReviewedPolicy,
): Promise<Native> {
  const root = repositoryRoute(reviewed.repository);
  const repository = record(await api(root));
  const branch = record(await api(`${root}/branches/main`));
  if (
    identifier(repository.id) !== identifier(reviewed.repositoryId) ||
    repository.full_name !== reviewed.repository ||
    branch.name !== "main" ||
    branch.protected !== true
  ) {
    throw new Error("trusted repository or protected base differs");
  }
  if (digest(record(branch.commit).sha) !== digest(reviewed.base)) {
    throw new Error("reviewed policy base is no longer current");
  }
  const pull = record(await api(`${root}/pulls/${String(identifier(number))}`));
  if (digest(record(pull.base).sha) !== digest(reviewed.base)) {
    throw new Error("candidate base differs from reviewed policy");
  }
  return pull;
}

function matchingRun(
  value: unknown,
  reviewed: ReviewedPolicy,
  pull: Native,
  number: number,
  head: string,
): number | undefined {
  const run = record(value);
  if (
    run.event !== "pull_request" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_sha !== head ||
    identifier(run.workflow_id) !== identifier(reviewed.workflowId) ||
    !associatedRun(run, pull, number, head, reviewed.base)
  ) {
    return undefined;
  }
  return identifier(run.id);
}

async function recentRun(
  api: ReadApi,
  reviewed: ReviewedPolicy,
  pull: Native,
  number: number,
  head: string,
): Promise<number> {
  const root = repositoryRoute(reviewed.repository);
  const endpoint = `${root}/actions/workflows/${String(identifier(reviewed.workflowId))}/runs`;
  const [, runs] = await objectInventory(api, endpoint, "workflow_runs");
  const matches = runs
    .map((run) => matchingRun(run, reviewed, pull, number, head))
    .filter((id): id is number => id !== undefined);
  if (matches.length === 0) {
    throw new Error("no successful native run associated with current PR head");
  }
  return Math.max(...matches);
}

async function candidateNumber(
  api: ReadApi,
  trigger: Trigger,
  reviewed: ReviewedPolicy,
): Promise<number> {
  if (trigger.pullNumber !== undefined) return identifier(trigger.pullNumber);
  const runId = identifier(trigger.runId);
  const root = repositoryRoute(reviewed.repository);
  const run = await api(`${root}/actions/runs/${String(runId)}`);
  return uniquePull(api, root, run, runId, reviewed.workflowId, reviewed.base);
}

export async function resolve(
  api: ReadApi,
  trigger: Trigger,
  reviewed: ReviewedPolicy,
): Promise<Policy> {
  if (
    trigger.repository !== reviewed.repository ||
    identifier(trigger.repositoryId) !== identifier(reviewed.repositoryId) ||
    reviewed.requiredNames.size === 0
  ) {
    throw new Error("trigger differs from reviewed repository or matrix");
  }
  const number = await candidateNumber(api, trigger, reviewed);
  const pull = await currentCandidate(api, number, reviewed);
  const head = digest(record(pull.head).sha);
  const runId =
    trigger.kind === "completed_run"
      ? identifier(trigger.runId)
      : await recentRun(api, reviewed, pull, number, head);
  return {
    repository: reviewed.repository,
    pullNumber: number,
    head,
    base: reviewed.base,
    workflowId: reviewed.workflowId,
    runId,
    requiredNames: reviewed.requiredNames,
  };
}
