/** Require native issue-comment rationale by the eligible approved reviewer. */

import { digest, identifier, record, text } from "./review-fields.js";

type Native = Record<string, unknown>;

export function commentReason(body: unknown, head: string): string {
  const prefix = `Policy rationale for ${digest(head)}:`;
  const value = text(body);
  if (!value.startsWith(prefix)) {
    throw new Error("comment must name the full current head");
  }
  const reason = value.slice(prefix.length).trim();
  if (reason.length < 30) {
    throw new Error("comment needs substantive policy rationale");
  }
  return reason;
}

function commentIdentity(
  value: unknown,
  issueUrl: string,
): [number, number, Native] {
  const item = record(value);
  const identity = identifier(item.id);
  if (text(item.issue_url) !== issueUrl) {
    throw new Error("comment belongs to another issue");
  }
  return [identity, identifier(record(item.user).id), item];
}

function hasReason(item: Native, head: string): boolean {
  try {
    commentReason(item.body, head);
  } catch {
    return false;
  }
  return true;
}

function qualifyingId(
  value: unknown,
  issueUrl: string,
  seen: Set<number>,
  reviewer: number,
  head: string,
): number {
  const [identity, author, item] = commentIdentity(value, issueUrl);
  if (seen.has(identity)) throw new Error("duplicate native comment identity");
  seen.add(identity);
  return author === reviewer && hasReason(item, head) ? identity : 0;
}

export function requireComment(
  comments: unknown[],
  reviewerId: unknown,
  head: unknown,
  issueUrl: unknown,
  complete: unknown,
): number {
  if (complete !== true) {
    throw new Error("complete native comment inventory required");
  }
  const reviewer = identifier(reviewerId);
  const digestValue = digest(head);
  const issue = text(issueUrl);
  const seen = new Set<number>();
  let latest = 0;
  for (const value of comments) {
    latest = Math.max(
      latest,
      qualifyingId(value, issue, seen, reviewer, digestValue),
    );
  }
  if (latest === 0) {
    throw new Error("current-head maintainer rationale comment is missing");
  }
  return latest;
}
