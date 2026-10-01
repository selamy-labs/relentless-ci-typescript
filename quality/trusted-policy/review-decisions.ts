/** Decide whether native review evidence authorizes a protected policy change. */

import {
  digest,
  identifier,
  rationale,
  record,
  text,
  timestamp,
} from "./review-fields.js";

type Native = Record<string, unknown>;
interface IdentifiedReview {
  identity: number;
  user: number;
  item: Native;
}
type Review = IdentifiedReview & { at: number };

function reviewIdentity(value: unknown): IdentifiedReview {
  const item = record(value);
  return {
    identity: identifier(item.id),
    user: identifier(record(item.user).id),
    item,
  };
}

function retainReview(
  latest: Map<number, Review>,
  identified: IdentifiedReview,
): void {
  const review = { ...identified, at: 0 };
  const state = text(review.item.state);
  if (
    !new Set([
      "APPROVED",
      "CHANGES_REQUESTED",
      "DISMISSED",
      "COMMENTED",
      "PENDING",
    ]).has(state)
  ) {
    throw new Error("unknown native review state");
  }
  if (state === "COMMENTED" || state === "PENDING") return;
  review.at = timestamp(review.item.submitted_at);
  const previous = latest.get(review.user);
  if (
    previous === undefined ||
    review.at > previous.at ||
    (review.at === previous.at && review.identity > previous.identity)
  ) {
    latest.set(review.user, review);
  }
}

export function latestReviews(values: unknown[]): Map<number, Native> {
  const identities = new Set<number>();
  const latest = new Map<number, Review>();
  for (const value of values) {
    const review = reviewIdentity(value);
    if (identities.has(review.identity)) {
      throw new Error("duplicate native review identity");
    }
    identities.add(review.identity);
    retainReview(latest, review);
  }
  return new Map([...latest].map(([user, review]) => [user, review.item]));
}

export function validateCandidate(
  value: unknown,
  head: string,
  base: string,
): number {
  const pr = record(value);
  const author = identifier(record(pr.user).id);
  if (digest(record(pr.head).sha) !== digest(head)) {
    throw new Error("candidate head changed during evaluation");
  }
  if (digest(record(pr.base).sha) !== digest(base)) {
    throw new Error("trusted base changed during evaluation");
  }
  if (pr.state !== "open" || pr.draft !== false) {
    throw new Error("approval requires an open ready pull request");
  }
  return author;
}

function commitAuthors(value: unknown): [number, number] {
  const item = record(value);
  return [
    identifier(record(item.author).id),
    identifier(record(item.committer).id),
  ];
}

function includeCommit(
  value: unknown,
  seen: Set<string>,
  contributors: Set<number>,
): void {
  const item = record(value);
  const sha = digest(item.sha);
  if (seen.has(sha)) throw new Error("duplicate native commit identity");
  seen.add(sha);
  for (const person of commitAuthors(item)) contributors.add(person);
}

function contributorIds(
  pr: Native,
  commits: unknown[],
  author: number,
): Set<number> {
  if (identifier(pr.commits) !== commits.length) {
    throw new Error("complete native commit inventory required");
  }
  const contributors = new Set([author]);
  const commitsSeen = new Set<string>();
  for (const value of commits) {
    includeCommit(value, commitsSeen, contributors);
  }
  return contributors;
}

function matchingRole(value: unknown, reviewer: Native): boolean {
  const role = record(value);
  const user = record(role.user);
  if (
    identifier(user.id) !== identifier(reviewer.id) ||
    user.login !== reviewer.login
  ) {
    throw new Error("platform role identity differs from reviewer");
  }
  return ["maintain", "admin"].includes(text(role.role_name));
}

function eligible(
  item: Native,
  user: number,
  authors: Set<number>,
  head: string,
): boolean {
  return (
    !authors.has(user) && item.state === "APPROVED" && item.commit_id === head
  );
}

function hasRationale(value: unknown): boolean {
  try {
    rationale(value);
    return true;
  } catch {
    return false;
  }
}

function qualifies(
  item: Native,
  user: number,
  authors: Set<number>,
  head: string,
  roles: Map<number, unknown>,
  requireReason: boolean,
): boolean {
  if (!eligible(item, user, authors, head)) return false;
  if (!matchingRole(roles.get(user), record(item.user))) return false;
  return !requireReason || hasRationale(item.body);
}

export function requireApproval(
  candidate: unknown,
  reviews: unknown[],
  roles: Map<number, unknown>,
  expectedHead: string,
  expectedBase: string,
  complete: boolean,
  commits: unknown[],
  requireReason = true,
): number {
  if (!complete) {
    throw new Error("complete authenticated metadata inventory required");
  }
  const pr = record(candidate);
  const author = validateCandidate(pr, expectedHead, expectedBase);
  const authors = contributorIds(pr, commits, author);
  for (const [user, item] of latestReviews(reviews)) {
    if (qualifies(item, user, authors, expectedHead, roles, requireReason)) {
      return user;
    }
  }
  throw new Error("current non-author maintainer approval is missing");
}
