import { resolve } from "node:path";
import { ESLint, type Linter } from "eslint";
import { expect, test } from "vitest";
import { nativeLint } from "./native-lint.js";
import eslintConfig from "../eslint.config.mjs";
import vitestConfig from "../quality/vitest-config.js";
import checks from "../quality/checks.json" with { type: "json" };
import manifest from "../package.json" with { type: "json" };

const sourceFile = resolve("src/validation.ts");
test("stability gate repeats the full suite with two shuffled seeds", () => {
  expect(checks).toContainEqual(["run", "stability"]);
  expect(manifest.scripts.stability).toBe(
    "npm test -- --sequence.shuffle --sequence.seed 41 && npm test -- --sequence.shuffle --sequence.seed 73",
  );
  expect(vitestConfig.test.retry).toBe(0);
});
function rules(results: ESLint.LintResult[]): string[] {
  return results.flatMap((result) =>
    result.messages.flatMap((message) =>
      message.ruleId ? [message.ruleId] : [],
    ),
  );
}
function branching(count: number): string {
  const branches = Array.from(
    { length: count },
    (_, index) => `if (flags[${String(index)}]) value++;`,
  ).join("\n");
  return `export function measure(flags: readonly boolean[]): number {\nlet value = 0;\n${branches}\nreturn value;\n}`;
}

test("native test configuration enrolls all authored executable roots", () => {
  expect(vitestConfig.test.allowOnly).toBe(false);
  expect(vitestConfig.test.passWithNoTests).toBe(false);
  expect(vitestConfig.test.retry).toBe(0);
  expect(vitestConfig.test.dangerouslyIgnoreUnhandledErrors).toBe(false);
  expect(vitestConfig.test.setupFiles).toEqual(["tests/runtime-setup.ts"]);
  expect(vitestConfig.test.reporters).toEqual([
    "default",
    "json",
    "./quality/diagnostics-reporter.ts",
  ]);
  expect(vitestConfig.test.outputFile).toBe(".quality-results/tests.json");
  expect(vitestConfig.test.include).toEqual(["tests/**/*.test.ts"]);
  expect(vitestConfig.test.root).toBe(".");
  expect(vitestConfig.test.coverage.include).toEqual([
    "src/**/*.ts",
    "quality/**/*.ts",
    "eslint.config.mjs",
    "dependency-policy.mjs",
    "dependency-main.mjs",
  ]);
  expect(vitestConfig.test.coverage.provider).toBe("v8");
  expect(vitestConfig.test.coverage.thresholds).toEqual({
    lines: 100,
    branches: 100,
    functions: 100,
    statements: 100,
  });
});

test("native ESLint configuration enforces strict semantic rules", () => {
  expect(Array.isArray(eslintConfig)).toBe(true);
  const result = nativeLint(
    "export function unsafe(value: any): any { return value; }",
    sourceFile,
  );
  expect(rules(result)).toContain("@typescript-eslint/no-explicit-any");
}, 30_000);

test("native ESLint requires every union switch case", () => {
  const prefix =
    'type Kind = "a" | "b"; export function kind(value: Kind): number { switch (value) {';
  const missing = nativeLint(
    `${prefix} case "a": return 1; default: return 0; } }`,
    sourceFile,
  );
  expect(rules(missing)).toContain(
    "@typescript-eslint/switch-exhaustiveness-check",
  );
  const complete = nativeLint(
    `${prefix} case "a": return 1; case "b": return 2; } }`,
    sourceFile,
  );
  expect(rules(complete)).not.toContain(
    "@typescript-eslint/switch-exhaustiveness-check",
  );
}, 30_000);

test("native imported configuration enrolls the focused-test plugin", async () => {
  const linter = new ESLint({
    overrideConfig: eslintConfig as Linter.Config[],
    overrideConfigFile: true,
  });
  const results = await linter.lintText(
    'import { test, expect } from "vitest"; test.only("focus", () => { expect(1).toBe(1); });',
    { filePath: resolve("tests/tool-config.test.ts") },
  );
  expect(rules(results)).toContain("vitest/no-focused-tests");
});

test.each([399, 400])(
  "counts %s physical comment lines",
  (count) => {
    const result = nativeLint("// comment\n".repeat(count), sourceFile);
    expect(rules(result).includes("max-lines")).toBe(count > 399);
  },
  30_000,
);

test.each([5, 6])(
  "cognitive complexity boundary %s",
  (count) => {
    const result = nativeLint(branching(count), sourceFile);
    expect(rules(result).includes("sonarjs/cognitive-complexity")).toBe(
      count > 5,
    );
  },
  30_000,
);

test.each([9, 10])(
  "cyclomatic complexity boundary %s",
  (branches) => {
    const result = nativeLint(
      branching(branches),
      sourceFile,
      "--rule",
      '{"sonarjs/cognitive-complexity":"off"}',
    );
    expect(rules(result).includes("complexity")).toBe(branches > 9);
  },
  30_000,
);

test("JavaScript executable configuration retains structural rules", () => {
  const result = nativeLint(
    "// comment\n".repeat(400),
    resolve("eslint.config.mjs"),
  );
  expect(rules(result)).toContain("max-lines");
}, 30_000);
