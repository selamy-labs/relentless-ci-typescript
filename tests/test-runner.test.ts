import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readJson } from "../quality/security.js";
import { verifyTestReport } from "../quality/test-report.js";

const roots: string[] = [];
function nativeRun(source: string) {
  const root = mkdtempSync(join(tmpdir(), "relentless-test-runner-"));
  roots.push(root);
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests", "fixture.test.mjs"), source);
  const configuration = {
    resolve: {
      alias: { vitest: resolve("node_modules/vitest/dist/index.js") },
    },
    test: {
      include: ["tests/**/*.test.mjs"],
      allowOnly: false,
      passWithNoTests: false,
      retry: 0,
      reporters: ["json"],
      outputFile: join(root, "report.json"),
    },
  };
  writeFileSync(
    join(root, "vitest.config.mjs"),
    `export default ${JSON.stringify(configuration)};\n`,
  );
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/vitest/vitest.mjs"),
      "run",
      "--root",
      root,
      "--config",
      join(root, "vitest.config.mjs"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, CI: "", GITHUB_ACTIONS: "" },
    },
  );
  return { root, result };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const imports = "import { test, expect } from 'vitest';\n";
const passing = "test('passes', () => expect(1).toBe(1));\n";

test("native runner generates a complete receipt for a clean test", () => {
  const { root, result } = nativeRun(
    imports + passing + 'test("second", () => expect(2).toBe(2));\n',
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const data = readJson(join(root, "report.json"));
  verifyTestReport(data, ["tests/fixture.test.mjs"], root);
});

test.each(["skip", "todo"])(
  "a successful runner with %s cannot pass integrity",
  (mode) => {
    const { root, result } = nativeRun(
      imports + passing + `test.${mode}('omitted', () => expect(1).toBe(1));\n`,
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(() => {
      verifyTestReport(
        readJson(join(root, "report.json")),
        ["tests/fixture.test.mjs"],
        root,
      );
    }).toThrow();
  },
);

test("focused tests fail natively even outside CI", () => {
  const { root, result } = nativeRun(
    imports + passing + "test.only('focus', () => expect(1).toBe(1));\n",
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(JSON.stringify(readJson(join(root, "report.json")))).toContain("only");
});

test("empty discovery fails natively", () => {
  const { result } = nativeRun("// no tests\n");
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
});
