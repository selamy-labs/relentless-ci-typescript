import { tools } from "./duplication-tools.js";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { verifyDuplication } from "../quality/duplication.js";
import { temporaryDirectories } from "./temporary-directory.js";
vi.mock("node:child_process", { spy: true });
const directory = temporaryDirectories("relentless-duplication-test-");
const text = Array.from(
  { length: 12 },
  (_, index) => `export const item${String(index)} = ${String(index)};`,
).join("\n");
function fixture() {
  const root = directory();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "large.ts"), text);
  writeFileSync(join(root, "src", "small.ts"), "export const x = 1;");
  writeFileSync(join(root, "src", "empty.ts"), "");
  mkdirSync(join(root, ".quality-results", "duplication"), { recursive: true });
  writeFileSync(
    join(root, ".quality-results", "duplication", "verified.json"),
    "stale",
  );
  return root;
}
afterEach(() => {
  vi.mocked(execFileSync).mockReset();
});
test("native scans stage every authored byte and retain complete clean receipts", () => {
  const root = fixture();
  writeFileSync(join(root, ".jscpd.json"), '{"ignore":["**"]}');
  writeFileSync(join(root, ".gitignore"), "src\n");
  tools(root, text);
  verifyDuplication(root);
  expect(execFileSync).toHaveBeenCalledTimes(5);
  const output = join(root, ".quality-results", "duplication");
  const value = z
    .object({ sources: z.array(z.string()), eligible: z.array(z.unknown()) })
    .parse(JSON.parse(readFileSync(join(output, "verified.json"), "utf8")));
  expect(value.sources.sort()).toEqual([
    join("src", "empty.ts"),
    join("src", "large.ts"),
    join("src", "small.ts"),
  ]);
  expect(value.eligible).toHaveLength(1);
  const call = vi.mocked(execFileSync).mock.calls.at(-1);
  const args = z.array(z.string()).parse(call?.[1]);
  const config = z.string().parse(args[args.indexOf("--config") + 1]);
  expect(dirname(dirname(config))).toBe(tmpdir());
  expect(existsSync(dirname(config))).toBe(false);
  for (const index of [0, 1, 2]) {
    expect(
      existsSync(join(output, "inventory", String(index), "jscpd-report.json")),
    ).toBe(true);
  }
  expect(existsSync(join(output, "combined", "jscpd-report.json"))).toBe(true);
});
test.each([
  "version",
  "tool",
  "missing",
  "malformed",
  "changed",
  "finding",
  "invalid-output",
])("%s failure cannot retain stale success", (variant) => {
  const root = fixture();
  tools(root, text, variant);
  expect(() => {
    verifyDuplication(root);
  }).toThrow(variant === "version" ? /jscpd.*version receipt/u : undefined);
  expect(
    existsSync(join(root, ".quality-results", "duplication", "verified.json")),
  ).toBe(false);
});
test("missing mise and invalid version UTF-8 fail before scanning", () => {
  const root = fixture();
  vi.mocked(execFileSync).mockImplementationOnce(() => {
    throw new Error("ENOENT");
  });
  expect(() => {
    verifyDuplication(root);
  }).toThrow("ENOENT");
  vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from([255]));
  expect(() => {
    verifyDuplication(root);
  }).toThrow();
});

test.each([
  ["exact-minima", 2],
  ["below-tokens", 1],
  ["below-lines", 1],
] as const)("final inventory respects %s", (kind, count) => {
  const root = fixture();
  writeFileSync(join(root, "src", "boundary.ts"), kind);
  tools(root, text);
  verifyDuplication(root);
  const value = z
    .object({ eligible: z.array(z.unknown()) })
    .parse(
      JSON.parse(
        readFileSync(
          join(root, ".quality-results", "duplication", "verified.json"),
          "utf8",
        ),
      ),
    );
  expect(value.eligible).toHaveLength(count);
});

test("fresh-clone verification succeeds without an output directory", () => {
  const root = fixture();
  rmSync(join(root, ".quality-results"), { recursive: true });
  tools(root, text);
  expect(() => {
    verifyDuplication(root);
  }).not.toThrow();
  expect(
    existsSync(join(root, ".quality-results", "duplication", "verified.json")),
  ).toBe(true);
});
test("cleanup tolerates an externally removed stage and preserves the original fault", () => {
  const root = fixture();
  tools(root, text, "cleanup");
  expect(() => {
    verifyDuplication(root);
  }).toThrow("native cleanup fault");
});
