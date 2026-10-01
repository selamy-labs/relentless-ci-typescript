/** Parse trusted trigger identifiers; current state must be reread natively. */

import { identifier, record, text } from "./review-fields.js";

export interface Trigger {
  kind: "rationale" | "completed_run" | "dispatch";
  repository: string;
  repositoryId: number;
  pullNumber?: number;
  runId?: number;
}

function dispatchEvent(
  event: Record<string, unknown>,
  name: string,
  id: number,
): Trigger {
  if (event.action !== "relentless-policy-reevaluate") {
    throw new Error("unsupported policy dispatch action");
  }
  const payload = record(event.client_payload);
  if (Object.keys(payload).length !== 1 || !("pull_number" in payload)) {
    throw new Error("policy dispatch must contain only a PR lookup number");
  }
  return {
    kind: "dispatch",
    repository: name,
    repositoryId: id,
    pullNumber: identifier(payload.pull_number),
  };
}

function requireRepository(value: unknown, name: string, id: number): void {
  const native = record(value);
  if (
    text(native.full_name) !== text(name) ||
    identifier(native.id) !== identifier(id)
  ) {
    throw new Error("issuer event belongs to another repository");
  }
}

function rationaleEvent(
  event: Record<string, unknown>,
  name: string,
  id: number,
): Trigger {
  if (!["created", "edited", "deleted"].includes(text(event.action))) {
    throw new Error("unsupported rationale event action");
  }
  const issue = record(event.issue);
  record(issue.pull_request);
  return {
    kind: "rationale",
    repository: name,
    repositoryId: id,
    pullNumber: identifier(issue.number),
  };
}

function completedRunEvent(
  event: Record<string, unknown>,
  name: string,
  id: number,
): Trigger {
  if (event.action !== "completed") {
    throw new Error("only a completed workflow run can initiate evaluation");
  }
  const run = record(event.workflow_run);
  if (run.event !== "pull_request") {
    throw new Error("issuer needs a pull-request workflow run");
  }
  if (!Array.isArray(run.pull_requests)) {
    throw new Error("native run associations must be an array");
  }
  const pulls = run.pull_requests as unknown[];
  if (pulls.length > 1) {
    throw new Error("run must not identify multiple pull requests");
  }
  const runId = identifier(run.id);
  if (pulls.length === 0) {
    return { kind: "completed_run", repository: name, repositoryId: id, runId };
  }
  return {
    kind: "completed_run",
    repository: name,
    repositoryId: id,
    pullNumber: identifier(record(pulls[0]).number),
    runId,
  };
}

export function parseEvent(
  eventName: unknown,
  value: unknown,
  expectedName: string,
  expectedId: number,
): Trigger {
  const event = record(value);
  requireRepository(event.repository, expectedName, expectedId);
  if (eventName === "repository_dispatch")
    return dispatchEvent(event, expectedName, expectedId);
  if (eventName === "issue_comment")
    return rationaleEvent(event, expectedName, expectedId);
  if (eventName === "workflow_run")
    return completedRunEvent(event, expectedName, expectedId);
  throw new Error("unsupported trusted issuer event");
}
