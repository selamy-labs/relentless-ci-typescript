/** Compose native trigger resolution, review evaluation, and App-owned check. */

import {
  currentCandidate,
  resolve,
  type ReviewedPolicy,
} from "./issuer-resolution.js";
import { evaluateComment, type Policy } from "./metadata-collector.js";
import type { ReadApi } from "./metadata-pages.js";
import { digest, record } from "./review-fields.js";
import { parseEvent } from "./trusted-event.js";

export type Publisher = (head: string, passed: boolean) => Promise<number>;

export async function issue(
  api: ReadApi,
  publish: Publisher,
  eventName: unknown,
  event: unknown,
  reviewed: ReviewedPolicy,
): Promise<number> {
  const trigger = parseEvent(
    eventName,
    event,
    reviewed.repository,
    reviewed.repositoryId,
  );
  let policy: Policy;
  try {
    policy = await resolve(api, trigger, reviewed);
  } catch (error) {
    if (trigger.pullNumber === undefined) throw error;
    const pull = await currentCandidate(api, trigger.pullNumber, reviewed);
    return publish(digest(record(pull.head).sha), false);
  }
  const failed = await publish(policy.head, false);
  try {
    await evaluateComment(api, policy);
  } catch {
    return failed;
  }
  return publish(policy.head, true);
}
