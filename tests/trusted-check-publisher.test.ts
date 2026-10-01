import { expect, test, vi } from "vitest";
import {
  CHECK_NAME,
  checkPayload,
  publishCheck,
  verifyCheckResponse,
  type CheckPayload,
  type CheckTransport,
} from "../quality/trusted-policy/check-publisher.js";

const HEAD = "a".repeat(40);
const ROUTE = "repos/owner/repo/check-runs";

function response(body: CheckPayload, id = 77): object {
  return { ...body, id, app: { id: 41 } };
}

function transport(created: unknown, observed: unknown): CheckTransport {
  return {
    post: vi.fn(() => Promise.resolve(created)),
    get: vi.fn(() => Promise.resolve(observed)),
  };
}

test.each([
  [true, "success", "Trusted policy qualified"],
  [false, "failure", "Trusted policy rejected"],
] as const)(
  "publishes a fixed %s decision",
  async (passed, conclusion, title) => {
    const body = checkPayload(HEAD, passed);
    const api = transport(response(body), response(body));
    expect(await publishCheck(api, "owner/repo", 41, HEAD, passed)).toBe(77);
    expect(body).toEqual({
      name: CHECK_NAME,
      head_sha: HEAD,
      status: "completed",
      conclusion,
      output: {
        title,
        summary: passed
          ? "Native run, review, and protected policy evidence qualified."
          : "Required trusted policy evidence is absent or invalid.",
      },
    });
    expect(api.post).toHaveBeenCalledExactlyOnceWith(ROUTE, body);
    expect(api.get).toHaveBeenCalledExactlyOnceWith(`${ROUTE}/77`);
  },
);

test.each(["b".repeat(39), "A".repeat(40), "g".repeat(40), 42, null])(
  "rejects an unbound commit %j",
  (head) => {
    expect(() => checkPayload(head, true)).toThrow();
  },
);

test.each([0, 1, "true", null, {}])(
  "rejects a non-boolean decision %j",
  (value) => {
    expect(() => checkPayload(HEAD, value)).toThrow();
  },
);

test.each([
  "owner",
  "owner//repo",
  "owner/.",
  "owner/..",
  "owner/repo/extra",
  7,
])("rejects invalid repository %j before posting", async (repository) => {
  const body = checkPayload(HEAD, true);
  const api = transport(response(body), response(body));
  await expect(publishCheck(api, repository, 41, HEAD, true)).rejects.toThrow();
  expect(api.post).not.toHaveBeenCalled();
});

test.each([0, -1, 1.5, "41", null])(
  "rejects invalid dedicated App identity %j before posting",
  async (appId) => {
    const body = checkPayload(HEAD, true);
    const api = transport(response(body), response(body));
    await expect(
      publishCheck(api, "owner/repo", appId, HEAD, true),
    ).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  },
);

test.each([
  ["name", "other"],
  ["head_sha", "b".repeat(40)],
  ["status", "queued"],
  ["conclusion", "failure"],
  ["app", { id: 42 }],
  ["id", 0],
] as const)("rejects mismatched native %s", (field, value) => {
  const body = checkPayload(HEAD, true);
  expect(() =>
    verifyCheckResponse({ ...response(body), [field]: value }, body, 41),
  ).toThrow();
});

test("rejects a changed readback identity", async () => {
  const body = checkPayload(HEAD, true);
  const api = transport(response(body), response(body, 78));
  await expect(publishCheck(api, "owner/repo", 41, HEAD, true)).rejects.toThrow(
    "readback changed identity",
  );
});

test("propagates a failed native publication without reading", async () => {
  const api: CheckTransport = {
    post: vi.fn(() => Promise.reject(new Error("native POST failed"))),
    get: vi.fn(),
  };
  await expect(publishCheck(api, "owner/repo", 41, HEAD, true)).rejects.toThrow(
    "native POST failed",
  );
  expect(api.get).not.toHaveBeenCalled();
});
