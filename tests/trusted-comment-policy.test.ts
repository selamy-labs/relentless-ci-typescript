import { expect, test } from "vitest";
import {
  commentReason,
  requireComment,
} from "../quality/trusted-policy/comment-policy.js";

const HEAD = "a".repeat(40);
const ISSUE = "https://api.github.com/repos/owner/repo/issues/7";
const BODY = `Policy rationale for ${HEAD}: Complete mutation scope stays protected.`;

function comment(
  identity = 1,
  author = 2,
  body: unknown = BODY,
): Record<string, unknown> {
  return {
    id: identity,
    user: { id: author },
    issue_url: ISSUE,
    body,
    author_association: "OWNER",
  };
}

test("qualifies only the approved reviewer at the current head", () => {
  expect(requireComment([comment(), comment(2, 3)], 2, HEAD, ISSUE, true)).toBe(
    1,
  );
  expect(commentReason(BODY, HEAD)).toBe(
    "Complete mutation scope stays protected.",
  );
});

test("returns the latest qualifying native identity", () => {
  expect(requireComment([comment(), comment(3)], 2, HEAD, ISSUE, true)).toBe(3);
});

test.each([
  null,
  "",
  `Policy rationale for ${"b".repeat(40)}: reason`,
  `Policy rationale for ${HEAD}: short`,
])("rejects missing, stale or short rationale %j", (body) => {
  expect(() =>
    requireComment([comment(1, 2, body)], 2, HEAD, ISSUE, true),
  ).toThrow();
});

test("does not trust author association over native reviewer identity", () => {
  expect(() => requireComment([comment(1, 4)], 2, HEAD, ISSUE, true)).toThrow(
    "missing",
  );
  expect(
    requireComment([comment(1, 4), comment(2)], 2, HEAD, ISSUE, true),
  ).toBe(2);
});

test("rejects duplicate or foreign native comment identities", () => {
  expect(() =>
    requireComment([comment(), comment()], 2, HEAD, ISSUE, true),
  ).toThrow("duplicate");
  expect(() =>
    requireComment(
      [{ ...comment(), issue_url: `${ISSUE}8` }],
      2,
      HEAD,
      ISSUE,
      true,
    ),
  ).toThrow("another issue");
});

test.each([false, null, 1])("rejects incomplete inventory %j", (complete) => {
  expect(() => requireComment([comment()], 2, HEAD, ISSUE, complete)).toThrow(
    "complete",
  );
});

test("rejects empty inventory and invalid reviewer identity", () => {
  expect(() => requireComment([], 2, HEAD, ISSUE, true)).toThrow("missing");
  expect(() => requireComment([comment()], 0, HEAD, ISSUE, true)).toThrow(
    "positive",
  );
});
