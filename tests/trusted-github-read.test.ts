import { expect, test, vi } from "vitest";
import {
  decodeResponse,
  endpointPath,
  githubApi,
  repositoryRoute,
  type Execute,
} from "../quality/trusted-policy/github-read.js";

const REPO = "owner/repo";
const ROOT = `repos/${REPO}`;
const ENDPOINT = `${ROOT}/pulls/1/reviews?per_page=100&page=1`;
const bytes = (source: string): Uint8Array => new TextEncoder().encode(source);

test("binds native metadata to a valid repository identity", () => {
  expect(repositoryRoute(REPO)).toBe(ROOT);
  expect(endpointPath(ROOT, REPO)).toBe(ROOT);
  expect(endpointPath(`${ROOT}/pulls/1`, REPO)).toBe(`${ROOT}/pulls/1`);
  expect(endpointPath(ENDPOINT, REPO)).toBe(ENDPOINT);
});

test.each([
  "owner",
  "owner//repo",
  "owner/.",
  "owner/..",
  "-owner/repo",
  "owner/repo/extra",
  4,
])("rejects unsafe repository %j", (repo) => {
  expect(() => repositoryRoute(repo)).toThrow();
});

test.each([
  "https://attacker.test/metadata",
  "repos/another/repo/pulls/1",
  "repos/owner/repo-two/pulls/1",
  `${ROOT}/pulls/%2e%2e/secrets`,
  `${ROOT}/pulls/../secrets`,
  `${ROOT}/pulls/./1`,
  `${ROOT}/pulls//1`,
  `${ROOT}/pulls/1#fragment`,
  `${ROOT}/pulls/1?per_page=1&page=1`,
  `${ROOT}/pulls/1?per_page=100&page=0`,
])("rejects arbitrary metadata route %s", (route) => {
  expect(() => endpointPath(route, REPO)).toThrow();
});

test.each([
  "NaN",
  "Infinity",
  "-Infinity",
  "1e999",
  '{"id":1,"id":2}',
  '{"a":{"x":1,"x":2}}',
])("rejects untrustworthy JSON %s", (source) => {
  expect(() => decodeResponse(bytes(source))).toThrow();
});

test.each(["", "{", "null trailing", "// comment\n{}", '{"a":1,}'])(
  "rejects invalid JSON %j",
  (source) => {
    expect(() => decodeResponse(bytes(source))).toThrow();
  },
);

test("rejects malformed UTF-8 and oversized output", () => {
  expect(() => decodeResponse(Uint8Array.of(0xff))).toThrow();
  expect(() => decodeResponse(new Uint8Array(8 * 1024 * 1024 + 1))).toThrow(
    "byte budget",
  );
});

test("accepts strict nested native JSON", () => {
  expect(decodeResponse(bytes('{"items":[{"id":1}],"ok":true}'))).toEqual({
    items: [{ id: 1 }],
    ok: true,
  });
});

test("executes an exact read-only native request", () => {
  const execute = vi.fn(() => Buffer.from('{"ok":true}')) as unknown as Execute;
  const read = githubApi("/trusted/gh", REPO, execute);
  expect(read(ENDPOINT)).toEqual({ ok: true });
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    "/trusted/gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      ENDPOINT,
    ],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 + 1 },
  );
});

test("rejects a relative CLI path before any request", () => {
  expect(() => githubApi("gh", REPO)).toThrow("absolute");
});

test("does not credit output when the native request fails", () => {
  const execute = vi.fn(() => {
    throw new Error("native GET failed");
  }) as unknown as Execute;
  const read = githubApi("/trusted/gh", REPO, execute);
  expect(() => read(ENDPOINT)).toThrow("native GET failed");
});
