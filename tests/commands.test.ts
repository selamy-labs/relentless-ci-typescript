import { temporaryDirectories } from "./temporary-directory.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { run } from "../quality/commands.js";

const repository = temporaryDirectories("relentless-commands-");

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
