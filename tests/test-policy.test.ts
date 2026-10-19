import { resolve } from "node:path";
import { ESLint, type Linter } from "eslint";
import { expect, test } from "vitest";
import eslintConfig from "../eslint.config.mjs";

// JSON import types widen rule severity strings. ESLint validates this native
// config at lint time; the assertion only bridges its public configuration type.
const overrideConfig = eslintConfig as Linter.Config[];
const filePath = resolve("tests/test-policy.test.ts");
const imports = 'import { test, describe, expect } from "vitest";\n';
const body = '"example", () => { expect(1).toBe(1); }';

async function policyDiagnostics(
  source: string,
): Promise<Linter.LintMessage[]> {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(source, { filePath });
  return results.flatMap((result) => result.messages);
}

async function policyMessages(source: string): Promise<string[]> {
  return (await policyDiagnostics(source)).map((message) =>
    String(message.ruleId),
  );
}

test("native analyzer accepts an ordinary suite", async () => {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(`${imports}describe("ordinary", () => { test(${body}); });`, {
    filePath,
  });
  expect(results.flatMap((result) => result.messages)).toEqual([]);
}, 60_000);

test("execution diagnostics explain the required behavior", async () => {
  const messages = await policyDiagnostics(
    'import { test, expect } from "vitest"; test.skipIf(false)("case", () => { expect(1).toBe(1); });',
  );
  expect(
    messages.find((message) => message.ruleId === "relentless/test-execution")
      ?.message,
  ).toMatch(/run once.*unconditionally.*pass normally/u);
});

test("the execution rule accepts no configuration escape options", async () => {
  const analyzer = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      ...overrideConfig,
      {
        rules: {
          "relentless/test-execution": ["error", { allowRetries: true }],
        },
      },
    ],
  });
  await expect(
    analyzer.lintText("export const value = 1;", { filePath }),
  ).rejects.toThrow(/more than 0 items/u);
});

test.each([
  ["test.only", "vitest/no-focused-tests"],
  ['test["only"]', "vitest/no-focused-tests"],
  ["test.only.each([1])", "vitest/no-focused-tests"],
  ["describe.only", "vitest/no-focused-tests"],
  ["test.skip", "vitest/no-disabled-tests"],
  ['test["skip"]', "vitest/no-disabled-tests"],
  ["describe.skip", "vitest/no-disabled-tests"],
  ["test.todo", "vitest/warn-todo"],
  ["test.fails", "relentless/test-execution"],
  ["test.skipIf(true)", "relentless/test-execution"],
  ["test.runIf(false)", "relentless/test-execution"],
  ['test["skipIf"](true)', "relentless/test-execution"],
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
  ).toContain("relentless/test-execution");
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
      'test("ordinary", { retry: 0, repeats: 0, skip: false, only: false, todo: false, fails: false }, () => { expect(1).toBe(1); });',
    { filePath },
  );
  expect(results.flatMap((result) => result.messages)).toEqual([]);
});

test.each([
  "export const domain = { retry: 3, repeats: 2, only: true, skip: true, todo: true, fails: true };",
  "export const domain = { skipIf: () => 1, runIf: () => 2, fails: () => 3, only: () => 4 }; domain.skipIf(); domain.runIf(); domain.fails(); domain.only();",
  'import type { TestCase } from "vitest/node"; export function failed(task: TestCase): boolean { return task.options.fails ?? false; }',
  "export function flag(domain: Record<string, boolean>): boolean | undefined { return domain.skipIf; }",
  'import { test, expect } from "vitest"; const domain = { retry: 3, skip: true }; test("domain flags", () => { expect(domain.retry).toBe(3); expect(domain.skip).toBe(true); });',
  'import { test } from "vitest"; export const extended = test.extend<{ retry: number }>({ retry: 1 });',
  'import { test, expect } from "vitest"; test("case", { timeout: 500 }, () => { expect(1).toBe(1); });',
  'import { vi } from "vitest"; vi.stubGlobal("configuration", { retry: 1 });',
  'import { defineConfig } from "vitest/config"; const configuration = { retry: 0 }; export default defineConfig({ test: configuration });',
  'import { defineConfig } from "vitest/config"; export default defineConfig({ test: { typecheck: { enabled: true, only: false }, coverage: { enabled: false, thresholds: { lines: 100 } } } });',
  'import type { TestOptions } from "vitest"; export function copy(options: TestOptions): TestOptions { return options; } export const data = copy({ retry: 1 });',
  "export function select(domain: { skipIf: () => number }): number { const { skipIf: choose } = domain; return choose(); }",
  'export function invoke(domain: Record<"skipIf", () => number>): number { return domain.skipIf(); }',
  "export function select(domain: Record<string, number>, key: string): number | undefined { const { [key]: value, ...rest } = domain; return value ?? rest.fallback; }",
  'export function select(domain: Record<string, number>): number | undefined { const key = (): string => "value"; const { [key()]: value } = domain; return value; }',
  'import { test } from "vitest"; export const extended = test.extend("domain", { retry: 1, 1: true });',
  'import { test, expect } from "vitest"; const options = { retry: 0 }; test("case", { ...options }, () => { expect(1).toBe(1); });',
])("accepts unrelated flags and metadata %s", async (source) => {
  expect(await policyMessages(source)).toEqual([]);
});

test.each([
  'import { test as check } from "vitest"; check.skipIf(false)("case", () => {});',
  'import * as suite from "vitest"; suite.test.runIf(true)("case", () => {});',
  'import { test } from "vitest"; const check = test; check.fails("case", () => {});',
  'import { test } from "vitest"; declare module "vitest" { interface TestContext { readonly skip: { (note?: string): never; (condition: boolean, note?: string): void; }; } } test("case", context => { context.skip("waiting"); });',
  'import { test } from "vitest"; test.skipIf(false).each([1])("case", () => {});',
  'import { test } from "vitest"; test["skipIf"](false)("case", () => {});',
  'import { test } from "vitest"; const key = "skipIf"; test[key](false)("case", () => {});',
  'import { test } from "vitest"; const { skipIf: conditional } = test; conditional(false)("case", () => {});',
  'import { test } from "vitest"; const { fails: inverted } = test; inverted("case", () => {});',
  'import { test } from "vitest"; const key = "skipIf"; const { [key]: conditional } = test; conditional(false)("case", () => {});',
  'import { test } from "vitest"; const key = (): "skipIf" => "skipIf"; const { [key()]: conditional } = test; conditional(false)("case", () => {});',
  'import { test } from "vitest"; test.only("case", () => {});',
  'import { test } from "vitest"; test.skip("case", () => {});',
  'import { test } from "vitest"; test.todo("case");',
  'import type { TestAPI } from "vitest"; export function declare(check: TestAPI): void { check.fails("case", () => {}); }',
  'import { test } from "vitest"; test("case", { retry: 1 }, () => {});',
  'import { test } from "vitest"; test("case", ({ retry: 1 }), () => {});',
  'import { test } from "vitest"; test("case", { repeats: 1 }, () => {});',
  'import { test } from "vitest"; test.each([1])("case", { retry: 1 }, () => {});',
  'import { defineConfig } from "vitest/config"; export default defineConfig({ test: { retry: 1 } });',
  'import { defineConfig } from "vitest/config"; export default defineConfig({ test: { typecheck: { enabled: true, only: true } } });',
  'import { defineConfig, type ViteUserConfig } from "vitest/config"; declare module "vitest/config" { function defineConfig(config: ViteUserConfig): ViteUserConfig; } export default defineConfig({ test: { retry: 1 } });',
])("rejects actual Vitest execution policy %s", async (source) => {
  expect(await policyMessages(source)).toContain("relentless/test-execution");
});
