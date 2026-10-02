import { expect, test } from "vitest";
import {
  latestReviews,
  requireApproval,
  validateCandidate,
} from "../quality/trusted-policy/review-decisions.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const BODY = `Policy rationale: ${"x".repeat(30)}`;

function candidate(): Record<string, unknown> {
  return {
    user: { id: 1 },
    head: { sha: HEAD },
    base: { sha: BASE },
    state: "open",
    draft: false,
    commits: 1,
  };
}

function review(
  id = 10,
  user = 2,
  state = "APPROVED",
): Record<string, unknown> {
  return {
    id,
    user: { id: user, login: `user-${String(user)}` },
    state,
    submitted_at: "2026-09-29T15:00:00Z",
    commit_id: HEAD,
    body: BODY,
  };
}

function role(user = 2, name = "maintain"): Record<string, unknown> {
  return { user: { id: user, login: `user-${String(user)}` }, role_name: name };
}

function commit(): Record<string, unknown> {
  return { sha: HEAD, author: { id: 1 }, committer: { id: 4 } };
}

function decide(
  pr: unknown = candidate(),
  reviews: unknown[] = [review()],
  roles = new Map<number, unknown>([[2, role()]]),
  commits: unknown[] = [commit()],
  complete = true,
  reason = true,
): number {
  return requireApproval(
    pr,
    reviews,
    roles,
    HEAD,
    BASE,
    complete,
    commits,
    reason,
  );
}

test.each(["admin", "maintain"])("accepts current independent %s", (name) => {
  expect(decide(candidate(), [review()], new Map([[2, role(2, name)]]))).toBe(
    2,
  );
});

test.each(["CHANGES_REQUESTED", "DISMISSED", "COMMENTED", "PENDING"])(
  "rejects %s as approval",
  (state) => {
    expect(() => decide(candidate(), [review(10, 2, state)])).toThrow(
      "missing",
    );
  },
);

test("rejects self-review and commit authors or committers", () => {
  expect(() =>
    decide(candidate(), [review(10, 1)], new Map([[1, role(1, "admin")]])),
  ).toThrow("missing");
  expect(() =>
    decide(
      { ...candidate(), user: { id: 2 } },
      [review()],
      new Map([[2, role()]]),
      [{ ...commit(), author: { id: 1 }, committer: { id: 4 } }],
    ),
  ).toThrow("missing");
  for (const field of ["author", "committer"]) {
    expect(() =>
      decide(candidate(), [review()], new Map([[2, role()]]), [
        { ...commit(), [field]: { id: 2 } },
      ]),
    ).toThrow("missing");
  }
});

test.each([
  ["state", "closed"],
  ["draft", true],
  ["head", { sha: "c".repeat(40) }],
  ["base", { sha: "d".repeat(40) }],
] as const)("rejects changed candidate %s", (field, value) => {
  expect(() => decide({ ...candidate(), [field]: value })).toThrow();
});

test.each(["write", "triage", "read", "none", "custom"])(
  "rejects non-maintainer role %s",
  (name) => {
    expect(() =>
      decide(candidate(), [review()], new Map([[2, role(2, name)]])),
    ).toThrow("missing");
  },
);

test.each([
  null,
  "",
  "Approved",
  "Policy rationale: too short",
  `prefix ${BODY}`,
])("rejects inadequate rationale %j", (body) => {
  expect(() => decide(candidate(), [{ ...review(), body }])).toThrow("missing");
});

test("can validate an independent comment rationale mode", () => {
  expect(
    decide(
      candidate(),
      [{ ...review(), body: "" }],
      new Map([[2, role()]]),
      [commit()],
      true,
      false,
    ),
  ).toBe(2);
});

test("rejects a stale review at another head", () => {
  expect(() =>
    decide(candidate(), [{ ...review(), commit_id: "c".repeat(40) }]),
  ).toThrow("missing");
});

test("latest negative decision wins regardless of native order", () => {
  const original = review();
  const revoked = {
    ...review(11, 2, "CHANGES_REQUESTED"),
    submitted_at: "2026-09-29T16:00:00Z",
  };
  for (const values of [
    [original, revoked],
    [revoked, original],
  ]) {
    expect(() => decide(candidate(), values)).toThrow("missing");
  }
});

test("native submission time outranks review identity", () => {
  const oldApproval = review(20);
  const newerDismissal = {
    ...review(10, 2, "DISMISSED"),
    submitted_at: "2026-09-29T16:00:00Z",
  };
  for (const values of [
    [oldApproval, newerDismissal],
    [newerDismissal, oldApproval],
  ]) {
    expect(() => decide(candidate(), values)).toThrow("missing");
    expect(latestReviews(values).get(2)).toEqual(newerDismissal);
  }
});

test("newer approval restores eligibility; comments and pending do not replace it", () => {
  const revoked = review(10, 2, "CHANGES_REQUESTED");
  const approved = { ...review(11), submitted_at: "2026-09-29T16:00:00Z" };
  const comment = { ...review(12, 2, "COMMENTED"), submitted_at: null };
  const pending = { ...review(13, 2, "PENDING"), submitted_at: null };
  expect(decide(candidate(), [comment, approved, revoked, pending])).toBe(2);
});

test("ties use native review identities", () => {
  const approval = review(10);
  const dismissal = review(11, 2, "DISMISSED");
  for (const values of [
    [approval, dismissal],
    [dismissal, approval],
  ]) {
    expect(() => decide(candidate(), values)).toThrow("missing");
    expect(latestReviews(values).get(2)).toEqual(dismissal);
  }
  const restored = review(12);
  for (const values of [
    [dismissal, restored],
    [restored, dismissal],
  ]) {
    expect(decide(candidate(), values)).toBe(2);
    expect(latestReviews(values).get(2)).toEqual(restored);
  }
});

test("an invalid reviewer does not hide a separate eligible maintainer", () => {
  expect(
    decide(
      candidate(),
      [review(), review(11, 3)],
      new Map([
        [2, role(2, "read")],
        [3, role(3)],
      ]),
    ),
  ).toBe(3);
  expect(
    decide(
      candidate(),
      [{ ...review(), body: "" }, review(11, 3)],
      new Map([
        [2, role()],
        [3, role(3)],
      ]),
    ),
  ).toBe(3);
});

test.each([
  { id: 3, login: "user-2" },
  { id: 2, login: "impostor" },
])("requires exact reviewer identity in platform role response", (user) => {
  expect(() =>
    decide(candidate(), [review()], new Map([[2, { ...role(), user }]])),
  ).toThrow("identity");
});

test("rejects incomplete, absent, duplicate and unknown native inventories", () => {
  expect(() =>
    decide(candidate(), [review()], new Map([[2, role()]]), [commit()], false),
  ).toThrow("complete");
  expect(() => decide(candidate(), [])).toThrow("missing");
  expect(() => decide(candidate(), [review()], new Map())).toThrow();
  expect(() => latestReviews([review(), review()])).toThrow("duplicate");
  expect(() => latestReviews([review(10, 2, "SUCCESS")])).toThrow("unknown");
});

test("requires complete distinct commit authorship inventory", () => {
  expect(() =>
    decide(candidate(), [review()], new Map([[2, role()]]), []),
  ).toThrow("complete");
  expect(() =>
    decide({ ...candidate(), commits: 2 }, [review()], new Map([[2, role()]]), [
      commit(),
      commit(),
    ]),
  ).toThrow("duplicate");
  expect(() =>
    decide(candidate(), [review()], new Map([[2, role()]]), [
      { ...commit(), sha: "X" },
    ]),
  ).toThrow();
});

test("validates the candidate independently", () => {
  expect(validateCandidate(candidate(), HEAD, BASE)).toBe(1);
  expect(() => validateCandidate(null, HEAD, BASE)).toThrow();
  expect(() =>
    validateCandidate({ ...candidate(), head: { sha: BASE } }, HEAD, BASE),
  ).toThrow("candidate head changed during evaluation");
  expect(() =>
    validateCandidate({ ...candidate(), base: { sha: HEAD } }, HEAD, BASE),
  ).toThrow("trusted base changed during evaluation");
  expect(() =>
    validateCandidate({ ...candidate(), draft: true }, HEAD, BASE),
  ).toThrow("approval requires an open ready pull request");
});
