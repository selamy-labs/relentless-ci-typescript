import { resolve } from "node:path";
import { ESLint, type Linter } from "eslint";
import { beforeAll, expect, test } from "vitest";
import eslintConfig from "../eslint.config.mjs";

// JSON import types widen rule severity strings. ESLint validates this native
// config at lint time; the assertion only bridges its public configuration type.
const overrideConfig = eslintConfig as Linter.Config[];
const filePath = resolve("tests/test-policy.test.ts");
const imports = 'import { test, describe, expect } from "vitest";\n';
const body = '"example", () => { expect(1).toBe(1); }';

beforeAll(async () => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(`${imports}describe("ordinary", () => { test(${body}); });`, {
    filePath,
  });
  expect(results.flatMap((result) => result.messages)).toEqual([]);
}, 60_000);

test.each([
  ["test.only", "vitest/no-focused-tests"],
  ['test["only"]', "vitest/no-focused-tests"],
  ["test.only.each([1])", "vitest/no-focused-tests"],
  ["describe.only", "vitest/no-focused-tests"],
  ["test.skip", "vitest/no-disabled-tests"],
  ['test["skip"]', "vitest/no-disabled-tests"],
  ["describe.skip", "vitest/no-disabled-tests"],
  ["test.todo", "vitest/warn-todo"],
  ["test.fails", "no-restricted-syntax"],
  ["test.skipIf(true)", "no-restricted-syntax"],
  ["test.runIf(false)", "no-restricted-syntax"],
  ['test["skipIf"](true)', "no-restricted-syntax"],
])("rejects test execution shortcut %s", async (callee, rule) => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(`${imports}${callee}(${body});`, {
    filePath,
  });
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain(rule);
});

test.each([
  ['test("placeholder");', "vitest/no-disabled-tests"],
  [
    'import { fit } from "vitest"; fit("focus", () => {});',
    "vitest/no-test-prefixes",
  ],
  ['// test("unfinished", () => {});', "vitest/no-commented-out-tests"],
])("rejects incomplete or alternate declaration %s", async (source, rule) => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(`${imports}${source}`, {
    filePath,
  });
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain(rule);
});

test.each([
  "{ retry: 1 }",
  '{ "retry": 1 }',
  "{ repeats: 1 }",
  "{ only: true }",
  "{ skip: true }",
  "{ todo: true }",
  "{ fails: true }",
  "{ retry: Number(process.env.RETRIES) }",
])("rejects weakened test options %s", async (options) => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(
    `${imports}test("example", ${options}, () => { expect(1).toBe(1); });`,
    { filePath },
  );
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("no-restricted-syntax");
});

test("renaming an imported test cannot hide focus", async () => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(
    `import { test as check, expect } from "vitest"; check.only(${body});`,
    { filePath },
  );
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("vitest/no-focused-tests");
});

test.each(["node:test"])(
  "rejects alternate Node test import %s",
  async (module) => {
    const results = await new ESLint({
      overrideConfig,
      overrideConfigFile: true,
    }).lintText(`import alternate from "${module}"; export { alternate };`, {
      filePath,
    });
    expect(
      results.flatMap((result) =>
        result.messages.map((message) => message.ruleId),
      ),
    ).toContain("vitest/no-import-node-test");
  },
);

test("accepts ordinary tests, each tables and explicit non-weakening options", async () => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(
    'import { test, expect } from "vitest";\n' +
      'test.each([1, 2])("value %s", (value) => { expect(value).toBeGreaterThan(0); });\n' +
      'test("ordinary", { retry: 0, repeats: 0, skip: false, only: false }, () => { expect(1).toBe(1); });',
    { filePath },
  );
  expect(results.flatMap((result) => result.messages)).toEqual([]);
});
