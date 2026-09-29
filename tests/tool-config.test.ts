import { resolve } from "node:path";
import { ESLint } from "eslint";
import { expect, test } from "vitest";
import eslintConfig from "../eslint.config.mjs";
import vitestConfig from "../vitest.config.js";

const sourceFile = resolve("src/validation.ts");
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
  expect(vitestConfig.test.include).toEqual(["tests/**/*.test.ts"]);
  expect(vitestConfig.test.coverage.include).toEqual([
    "src/**/*.ts",
    "quality/**/*.ts",
    "vitest.config.ts",
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

test("native ESLint configuration enforces strict semantic rules", async () => {
  expect(Array.isArray(eslintConfig)).toBe(true);
  const result = await new ESLint().lintText(
    "export function unsafe(value: any): any { return value; }",
    { filePath: sourceFile },
  );
  expect(rules(result)).toContain("@typescript-eslint/no-explicit-any");
}, 30_000);

test.each([399, 400])("counts %s physical comment lines", async (count) => {
  const result = await new ESLint().lintText("// comment\n".repeat(count), {
    filePath: sourceFile,
  });
  expect(rules(result).includes("max-lines")).toBe(count > 399);
});

test.each([5, 6])("cognitive complexity boundary %s", async (count) => {
  const result = await new ESLint().lintText(branching(count), {
    filePath: sourceFile,
  });
  expect(rules(result).includes("sonarjs/cognitive-complexity")).toBe(
    count > 5,
  );
});

test.each([9, 10])("cyclomatic complexity boundary %s", async (branches) => {
  const linter = new ESLint({
    overrideConfig: [{ rules: { "sonarjs/cognitive-complexity": "off" } }],
  });
  const result = await linter.lintText(branching(branches), {
    filePath: sourceFile,
  });
  expect(rules(result).includes("complexity")).toBe(branches > 9);
});

test("JavaScript executable configuration retains structural rules", async () => {
  const result = await new ESLint().lintText("// comment\n".repeat(400), {
    filePath: resolve("eslint.config.mjs"),
  });
  expect(rules(result)).toContain("max-lines");
});
