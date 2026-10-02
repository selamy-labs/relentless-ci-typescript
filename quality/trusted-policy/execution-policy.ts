/** Bind a complete native Actions matrix to one candidate workflow. */

import { digest, identifier, record, text } from "./review-fields.js";

type Native = Record<string, unknown>;

function sequence(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("native policy array required");
  }
  return value as unknown[];
}

function requireSuccess(value: unknown): Native {
  const item = record(value);
  if (item.status !== "completed" || item.conclusion !== "success") {
    throw new Error("required execution must complete successfully");
  }
  return item;
}

export function verifyRun(
  value: unknown,
  workflowId: number,
  head: string,
): Native {
  const run = requireSuccess(value);
  if (identifier(run.workflow_id) !== identifier(workflowId)) {
    throw new Error("unrelated workflow cannot supply required evidence");
  }
  if (digest(run.head_sha) !== digest(head)) {
    throw new Error("workflow evidence belongs to a different PR head");
  }
  if (run.event !== "pull_request") {
    throw new Error("required untrusted-code evidence must be from a PR run");
  }
  return run;
}

function associatedPull(
  value: unknown,
  number: number,
  head: string,
  base: string,
): boolean {
  const pulls = sequence(record(value).pull_requests);
  if (pulls.length !== 1) return false;
  const pull = record(pulls[0]);
  return (
    identifier(pull.number) === identifier(number) &&
    digest(record(pull.head).sha) === digest(head) &&
    digest(record(pull.base).sha) === digest(base)
  );
}

function associatedFork(
  run: Native,
  pull: Native,
  number: number,
  head: string,
  base: string,
): boolean {
  const source = record(pull.head);
  const repository = record(source.repo);
  const native = record(run.head_repository);
  return (
    identifier(pull.number) === identifier(number) &&
    digest(record(pull.base).sha) === digest(base) &&
    digest(source.sha) === digest(head) &&
    text(source.ref) === text(run.head_branch) &&
    identifier(repository.id) === identifier(native.id) &&
    repository.full_name === native.full_name
  );
}

export function associatedRun(
  value: unknown,
  pullRequest: unknown,
  number: number,
  head: string,
  base: string,
): boolean {
  const run = record(value);
  const pulls = sequence(run.pull_requests);
  if (pulls.length > 0) return associatedPull(run, number, head, base);
  return associatedFork(run, record(pullRequest), number, head, base);
}

function jobIdentity(value: unknown, run: Native): [number, string] {
  const item = requireSuccess(value);
  if (identifier(item.run_id) !== identifier(run.id)) {
    throw new Error("job belongs to a different workflow run");
  }
  if (identifier(item.run_attempt) !== identifier(run.run_attempt)) {
    throw new Error("job belongs to a different workflow attempt");
  }
  if (digest(item.head_sha) !== digest(run.head_sha)) {
    throw new Error("job belongs to a different candidate");
  }
  return [identifier(item.id), text(item.name)];
}

function inventory(jobs: unknown[], run: Native): Set<string> {
  const identities = new Set<number>();
  const names = new Set<string>();
  for (const value of jobs) {
    const [id, name] = jobIdentity(value, run);
    if (identities.has(id) || names.has(name)) {
      throw new Error("duplicate native job identity or required name");
    }
    identities.add(id);
    names.add(name);
  }
  return names;
}

function sameNames(actual: Set<string>, expected: Set<string>): boolean {
  return (
    actual.size === expected.size &&
    [...actual].every((name) => expected.has(name))
  );
}

export function requireMatrix(
  workflowRun: unknown,
  jobs: unknown[],
  workflowId: number,
  expectedHead: string,
  expectedNames: Set<string>,
  nativeTotal: unknown,
  complete: boolean,
): void {
  if (!complete || expectedNames.size === 0) {
    throw new Error(
      "complete required matrix policy and native inventory needed",
    );
  }
  if (identifier(nativeTotal) !== jobs.length) {
    throw new Error("native paginated job inventory is incomplete");
  }
  const run = verifyRun(workflowRun, workflowId, expectedHead);
  if (!sameNames(inventory(jobs, run), expectedNames)) {
    throw new Error("native job inventory differs from required matrix");
  }
}
