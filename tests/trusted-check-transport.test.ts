import { expect, test, vi } from "vitest";
import { checkPayload } from "../quality/trusted-policy/check-publisher.js";
import {
  checkTransport,
  type Execute,
} from "../quality/trusted-policy/check-transport.js";

const REPOSITORY = "owner/repo";
const ROOT = "repos/owner/repo";
const HEAD = "a".repeat(40);

test("posts only the compiled check to the trusted repository", async () => {
  const body = checkPayload(HEAD, false);
  const execute = vi.fn(() => Buffer.from('{"id":41}')) as unknown as Execute;
  const transport = checkTransport("/trusted/gh", REPOSITORY, execute);
  await expect(transport.post(`${ROOT}/check-runs`, body)).resolves.toEqual({
    id: 41,
  });
  expect(execute).toHaveBeenCalledWith(
    "/trusted/gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      "--input",
      "-",
      `${ROOT}/check-runs`,
    ],
    {
      input: JSON.stringify(body),
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024 + 1,
    },
  );
});

test("readback stays on a fixed repository route", async () => {
  const execute = vi.fn(() => Buffer.from('{"id":41}')) as unknown as Execute;
  const transport = checkTransport("/trusted/gh", REPOSITORY, execute);
  await expect(transport.get(`${ROOT}/check-runs/41`)).resolves.toEqual({
    id: 41,
  });
  expect(execute).toHaveBeenCalledWith(
    "/trusted/gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      `${ROOT}/check-runs/41`,
    ],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 + 1 },
  );
});

test("rejects relative executable and cross-repository post", () => {
  expect(() => checkTransport("gh", REPOSITORY)).toThrow("absolute");
  const transport = checkTransport("/trusted/gh", REPOSITORY);
  expect(() =>
    transport.post("repos/other/repo/check-runs", checkPayload(HEAD, true)),
  ).toThrow("route differs");
});

test("invalid or oversized native response fails closed", async () => {
  const invalid = vi.fn(() => Buffer.from("invalid")) as unknown as Execute;
  const malformed = checkTransport("/trusted/gh", REPOSITORY, invalid);
  await expect(
    malformed.post(`${ROOT}/check-runs`, checkPayload(HEAD, true)),
  ).rejects.toThrow("invalid JSON");
  const huge = vi.fn(() =>
    Buffer.alloc(8 * 1024 * 1024 + 1),
  ) as unknown as Execute;
  const oversized = checkTransport("/trusted/gh", REPOSITORY, huge);
  await expect(
    oversized.post(`${ROOT}/check-runs`, checkPayload(HEAD, false)),
  ).rejects.toThrow("byte budget");
});
