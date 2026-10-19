import { resolve } from "node:path";
import { expect, test } from "vitest";
import { nativeLint } from "./native-lint.js";

const sourceFile = resolve("src/validation.ts");

test("native analyzer accepts ordinary source", () => {
  const results = nativeLint("export const safe = 1;", sourceFile);
  expect(results.flatMap((result) => result.messages)).toEqual([]);
}, 60_000);

test.each(["ts-ignore", "ts-nocheck", "ts-expect-error"])(
  "rejects compiler suppression %s even with a rationale",
  (directive) => {
    const results = nativeLint(
      `// @${directive}: A rationale cannot authorize weakening this gate.\nexport const safe = 1;`,
      sourceFile,
    );
    expect(
      results.flatMap((result) =>
        result.messages.map((message) => message.ruleId),
      ),
    ).toContain("@typescript-eslint/ban-ts-comment");
  },
  30_000,
);

test.each([
  "/* eslint-disable */",
  "/* eslint @typescript-eslint/no-explicit-any: off */",
  "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
])(
  "inline configuration cannot suppress errors: %s",
  (comment) => {
    const results = nativeLint(
      `${comment}\nexport function unsafe(value: any): any { return value; }`,
      sourceFile,
    );
    const messages = results.flatMap((result) => result.messages);
    expect(messages.map((message) => message.ruleId)).toContain(
      "@typescript-eslint/no-explicit-any",
    );
    expect(
      messages.some((message) => message.message.includes("noInlineConfig")),
    ).toBe(true);
  },
  30_000,
);

test.each(["TODO", "FIXME", "XXX", "todo", "fixme", "xxx"])(
  "accepts advisory source comment %s",
  (marker) => {
    const results = nativeLint(
      `// ${marker}: useful follow-up\nexport const safe = 1;`,
      sourceFile,
    );
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  },
  30_000,
);

test("accepts ordinary comments and type-check enablement", () => {
  const results = nativeLint(
    "// @ts-check\n// The public constant is intentional.\nexport const safe = 1;",
    sourceFile,
  );
  expect(results.flatMap((result) => result.messages)).toEqual([]);
}, 30_000);

test("debugger statements remain errors", () => {
  const results = nativeLint("debugger;", sourceFile);
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("no-debugger");
}, 30_000);

test("console logging remains an error", () => {
  const results = nativeLint("console.log('unexpected');", sourceFile);
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("no-console");
}, 30_000);
