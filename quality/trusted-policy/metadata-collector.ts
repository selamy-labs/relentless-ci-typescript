/** Collect native review and run evidence from a trusted repository only. */

import { isDeepStrictEqual } from "node:util";
import { associatedRun, requireMatrix } from "./execution-policy.js";
import { repositoryRoute } from "./github-read.js";
import {
  arrayInventory,
  objectInventory,
  type ReadApi,
} from "./metadata-pages.js";
import {
  latestReviews,
  requireApproval,
  validateCandidate,
} from "./review-decisions.js";
import { digest, identifier, record, text } from "./review-fields.js";

type Native = Record<string, unknown>;

export interface Policy {
  repository: string;
  pullNumber: number;
  head: string;
  base: string;
  workflowId: number;
  runId: number;
  requiredNames: Set<string>;
}

async function candidate(
  api: ReadApi,
  endpoint: string,
  policy: Policy,
): Promise<Native> {
  const pr = record(await api(endpoint));
  validateCandidate(pr, policy.head, policy.base);
  return pr;
}

async function roles(
  api: ReadApi,
  repository: string,
  reviews: unknown[],
): Promise<Map<number, unknown>> {
  const result = new Map<number, unknown>();
  for (const [user, review] of latestReviews(reviews)) {
    const login = text(record(review.user).login);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(login)) {
      throw new Error("native reviewer login must be a safe path segment");
    }
    result.set(
      user,
      await api(`${repository}/collaborators/${login}/permission`),
    );
  }
  return result;
}

async function collectRun(
  api: ReadApi,
  repository: string,
  policy: Policy,
  pr: Native,
): Promise<void> {
  const endpoint = `${repository}/actions/runs/${String(identifier(policy.runId))}`;
  const run = record(await api(endpoint));
  const attempt = identifier(run.run_attempt);
  if (!associatedRun(run, pr, policy.pullNumber, policy.head, policy.base)) {
    throw new Error("workflow run is not associated with current PR");
  }
  const [total, jobs] = await objectInventory(
    api,
    `${endpoint}/attempts/${String(attempt)}/jobs`,
    "jobs",
  );
  requireMatrix(
    run,
    jobs,
    policy.workflowId,
    policy.head,
    policy.requiredNames,
    total,
    true,
  );
  if (!isDeepStrictEqual(record(await api(endpoint)), run)) {
    throw new Error("workflow run changed during job evaluation");
  }
}

async function sameCandidate(
  api: ReadApi,
  endpoint: string,
  policy: Policy,
  first: Native,
): Promise<void> {
  if (!isDeepStrictEqual(await candidate(api, endpoint, policy), first)) {
    throw new Error("candidate metadata changed during evaluation");
  }
}

async function sameReviews(
  api: ReadApi,
  endpoint: string,
  first: unknown[],
): Promise<void> {
  if (!isDeepStrictEqual(await arrayInventory(api, endpoint), first)) {
    throw new Error("review inventory changed during evaluation");
  }
}

async function sameRoles(
  api: ReadApi,
  repository: string,
  reviews: unknown[],
  first: Map<number, unknown>,
): Promise<void> {
  if (!isDeepStrictEqual(await roles(api, repository, reviews), first)) {
    throw new Error("reviewer roles changed during evaluation");
  }
}

export async function evaluate(api: ReadApi, policy: Policy): Promise<number> {
  const repository = repositoryRoute(policy.repository);
  digest(policy.head);
  digest(policy.base);
  const endpoint = `${repository}/pulls/${String(identifier(policy.pullNumber))}`;
  const before = await candidate(api, endpoint, policy);
  const commits = await arrayInventory(api, `${endpoint}/commits`);
  const reviews = await arrayInventory(api, `${endpoint}/reviews`);
  const roleInventory = await roles(api, repository, reviews);
  const reviewer = requireApproval(
    before,
    reviews,
    roleInventory,
    policy.head,
    policy.base,
    true,
    commits,
  );
  await collectRun(api, repository, policy, before);
  await sameCandidate(api, endpoint, policy, before);
  await sameReviews(api, `${endpoint}/reviews`, reviews);
  await sameRoles(api, repository, reviews, roleInventory);
  return reviewer;
}
