/** Resolve an association-free fork run through unique current native PR identity. */

import { arrayInventory, type ReadApi } from "./metadata-pages.js";
import { digest, identifier, record, text } from "./review-fields.js";

type Native = Record<string, unknown>;

function sameHead(run: Native, pull: Native, base: string): boolean {
  const head = record(pull.head);
  const repository = record(head.repo);
  const native = record(run.head_repository);
  return (
    pull.state === "open" &&
    digest(record(pull.base).sha) === digest(base) &&
    digest(head.sha) === digest(run.head_sha) &&
    text(head.ref) === text(run.head_branch) &&
    identifier(repository.id) === identifier(native.id) &&
    repository.full_name === native.full_name
  );
}

function requireRunIdentity(
  run: Native,
  runId: number,
  workflowId: number,
): void {
  if (
    identifier(run.id) !== identifier(runId) ||
    identifier(run.workflow_id) !== identifier(workflowId) ||
    run.event !== "pull_request" ||
    run.status !== "completed"
  ) {
    throw new Error("native completed PR run identity differs");
  }
}

export async function uniquePull(
  api: ReadApi,
  root: string,
  value: unknown,
  runId: number,
  workflowId: number,
  base: string,
): Promise<number> {
  const run = record(value);
  requireRunIdentity(run, runId, workflowId);
  const pulls = await arrayInventory(api, `${root}/pulls`);
  const candidates = pulls.filter((pull) => sameHead(run, record(pull), base));
  if (candidates.length !== 1) {
    throw new Error("fork run does not identify exactly one current PR");
  }
  return identifier(record(candidates[0]).number);
}
