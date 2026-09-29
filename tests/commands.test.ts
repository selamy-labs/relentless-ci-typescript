import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { run } from "../quality/commands.js";

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-commands-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("runs structured arguments in the requested working directory", () => {
  const root = repository();
  run(
    process.execPath,
    [
      "-e",
      "require('node:fs').writeFileSync('receipt', process.argv[1])",
      "an argument with spaces",
    ],
    root,
    5000,
  );
  expect(readFileSync(join(root, "receipt"), "utf8")).toBe(
    "an argument with spaces",
  );
});

test("nonzero status, a missing tool and a timeout all fail", () => {
  const root = repository();
  expect(() => {
    run(process.execPath, ["-e", "process.exit(3)"], root, 5000);
  }).toThrow();
  expect(() => {
    run(join(root, "absent-tool"), [], root, 5000);
  }).toThrow();
  expect(() => {
    run(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], root, 20);
  }).toThrow();
  expect(existsSync(join(root, "receipt"))).toBe(false);
});
