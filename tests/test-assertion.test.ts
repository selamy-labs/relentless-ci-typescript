import { resolve } from "node:path";
import { ESLint, type Linter } from "eslint";
import { expect, test } from "vitest";
import { lintPolicy, overrideConfig } from "./policy-lint.js";

const filePath = resolve("tests/test-assertion.test.ts");
const vitest = 'import { test, expect } from "vitest";\n';
const fastCheck = 'import fc from "fast-check";\n';
const rule = "relentless/test-assertion";

async function diagnostics(source: string): Promise<Linter.LintMessage[]> {
  return (await lintPolicy(source, filePath)).filter(
    (message) => message.ruleId === rule,
  );
}

test("assertion diagnostics explain the required behavior", async () => {
  const messages = await diagnostics(`${vitest}test("empty", () => {});`);
  expect(messages.map((message) => [message.line, message.message])).toEqual([
    [2, "Vitest tests must reach an assertion that no catch block swallows."],
  ]);
}, 60_000);

test("the assertion rule accepts no configuration escape options", async () => {
  const analyzer = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      ...overrideConfig,
      { rules: { [rule]: ["error", { allowEmpty: true }] } },
    ],
  });
  await expect(
    analyzer.lintText("export const value = 1;", { filePath }),
  ).rejects.toThrow(/more than 0 items/u);
});

test.each([
  'test("matcher", () => { expect(1).toBe(1); });',
  'test("expression", () => expect(1).toBe(1));',
  'test("negated", () => { expect(1).not.toBe(2); });',
  'test("promise", async () => { await expect(Promise.resolve(1)).resolves.toBe(1); });',
  'test("count", () => { expect.assertions(0); });',
  'test("any", () => { expect.hasAssertions(); });',
  "function subject(): void { void 0; } test(subject, () => { expect(1).toBe(1); });",
  'test("options", { timeout: 500 }, () => { expect(1).toBe(1); });',
  'test.each([1])("table %s", (value) => { expect(value).toBe(1); });',
  'import { it } from "vitest"; it("alias", () => { expect(1).toBe(1); });',
  'import { test as check, expect as verify } from "vitest"; check("renamed", () => { verify(1).toBe(1); });',
  'function verify(): void { expect(1).toBe(1); } test("helper", () => { verify(); });',
  'const verify = (): void => { expect(1).toBe(1); }; test("arrow helper", () => { verify(); }); test("reuse", () => { verify(); });',
  'function overloaded(): void; function overloaded(value?: number): void { expect(value).toBeUndefined(); } test("overload", () => { overloaded(); });',
  'function verify(): void { expect(1).toBe(1); } test("reference", verify);',
  'test("rethrow", () => { try { expect(1).toBe(1); } catch (error) { void error; throw error; } });',
  'test("late", () => { try { expect(1).toBe(1); } catch (error) { void error; void 0; throw error; } });',
  'test("cleanup", () => { try { expect(1).toBe(1); } finally { void 0; } });',
  'test("final", () => { try { void 0; } catch { void 0; } finally { expect(1).toBe(1); } });',
  'test("guarded", () => { try { void 0; } catch (error) { expect(error).toBeDefined(); throw error; } });',
  'import { describe } from "vitest"; describe("suite", () => { void 0; });',
  'import { describe } from "vitest"; describe.each([1])("suite %s", () => { void 0; });',
  'test("placeholder");',
  'type TestAPI = (name: string, body: () => void) => void; declare const test: TestAPI; test("foreign", () => { void 0; });',
  "[1].forEach(() => { void 0; });",
])("accepts recognized assertion %s", async (source) => {
  expect(await diagnostics(`${vitest}${source}`)).toEqual([]);
});

test.each([
  'import assert from "node:assert"; test("default", () => { assert(true); });',
  'import { strictEqual as same } from "node:assert/strict"; test("named", () => { same(1, 1); });',
  'import * as assert from "node:assert"; test("namespace", () => { assert.equal(1, 1); });',
  'import assert from "node:assert"; test("method", () => { assert.deepStrictEqual([], []); });',
  `${fastCheck}test("property", () => { fc.assert(fc.property(fc.integer(), (value) => { expect(value).toBe(value); })); });`,
  'import * as check from "fast-check"; test("namespace", () => { check.assert(check.property(check.nat(), (value) => { expect(value).toBeGreaterThanOrEqual(0); })); });',
  'import { assert as holds, property, nat } from "fast-check"; test("named", () => { holds(property(nat(), (value) => { expect(value).toBeGreaterThanOrEqual(0); })); });',
  `${fastCheck}const predicate = (value: number): void => { expect(value).toBe(value); }; test("named predicate", () => { fc.assert(fc.property(fc.integer(), predicate)); });`,
])("accepts external assertion module %s", async (source) => {
  expect(
    await diagnostics(`import { test, expect } from "vitest"; ${source}`),
  ).toEqual([]);
});

test.each([
  'test("empty", () => {});',
  'test("work", () => { void Math.max(1, 2); });',
  'test("bare", () => { expect(1); });',
  'test("deferred", () => { const later = (): void => { expect(1).toBe(1); }; void later; });',
  'test("callback", () => { [1].forEach((value) => { expect(value).toBe(1); }); });',
  'test("iife", () => { (() => { expect(1).toBe(1); })(); });',
  'test.each([1])("table %s", () => {});',
  'test("empty catch", () => { try { expect(1).toBe(1); } catch {} });',
  'declare const table: Record<"run", () => void>; test("mapped", table.run);',
  'test("swallowed", () => { try { expect(1).toBe(1); } catch { void 0; } });',
  'test("swallowed finally", () => { try { expect(1).toBe(1); } catch { void 0; } finally { void 0; } });',
  'test("reported", () => { try { expect(1).toBe(1); } catch (error) { if (error) { throw error; } } });',
  'function verify(): void { try { expect(1).toBe(1); } catch { void 0; } } test("swallowing helper", () => { verify(); });',
  'function idle(): void { void 0; } test("idle helper", () => { idle(); });',
  'function loop(): void { loop(); } test("cycle", () => { loop(); });',
  'declare function external(): void; test("bodiless", () => { external(); });',
  'declare const external: () => void; test("bodiless variable", () => { external(); });',
  'const made = ((): (() => void) => () => { expect(1).toBe(1); })(); test("factory", () => { made(); });',
  'declare function make(): () => void; test("made", make());',
  'function assert(value: unknown): void { void value; } test("impostor", () => { assert(true); });',
  'function assert(value: unknown): void { void value; } declare function wrap(body: () => void): unknown; test("impostor property", () => { assert(wrap(() => { expect(1).toBe(1); })); });',
  'const counter = { assertions: (): number => 1 }; test("counter", () => { counter.assertions(); });',
  'interface ExpectStatic { (value: unknown): { toBe: (value: unknown) => void; }; } declare const local: ExpectStatic; test("foreign", () => { local(1).toBe(1); });',
])("rejects assertion-free test %s", async (source) => {
  expect(await diagnostics(`${vitest}${source}`)).toHaveLength(1);
});

test.each([
  `${fastCheck}test("empty property", () => { fc.assert(fc.property(fc.integer(), (value) => { void value; })); });`,
  `${fastCheck}test("check", () => { fc.check(fc.property(fc.integer(), (value) => { expect(value).toBe(value); })); });`,
  `${fastCheck}const holds = fc.property(fc.integer(), (value) => { expect(value).toBe(value); }); test("stored", () => { fc.assert(holds); });`,
  `${fastCheck}test("missing", () => { fc.assert(); });`,
  `${fastCheck}test("swallowed property", () => { fc.assert(fc.property(fc.integer(), (value) => { try { expect(value).toBe(value); } catch { void 0; } })); });`,
])("rejects assertion-free property %s", async (source) => {
  expect(await diagnostics(`${vitest}${source}`)).toHaveLength(1);
});
