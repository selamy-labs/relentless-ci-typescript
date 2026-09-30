import { resolve } from "node:path";
import { ESLint } from "eslint";
import { beforeAll, expect, test } from "vitest";

const sourceFile = resolve("src/validation.ts");

beforeAll(async () => {
  const results = await new ESLint().lintText("export const safe = 1;", {
    filePath: sourceFile,
  });
  expect(results.flatMap((result) => result.messages)).toEqual([]);
}, 30_000);

test.each(["ts-ignore", "ts-nocheck", "ts-expect-error"])(
  "rejects compiler suppression %s even with a rationale",
  async (directive) => {
    const results = await new ESLint().lintText(
      `// @${directive}: A rationale cannot authorize weakening this gate.\nexport const safe = 1;`,
      { filePath: sourceFile },
    );
    expect(
      results.flatMap((result) =>
        result.messages.map((message) => message.ruleId),
      ),
    ).toContain("@typescript-eslint/ban-ts-comment");
  },
);

test.each([
  "/* eslint-disable */",
  "/* eslint @typescript-eslint/no-explicit-any: off */",
  "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
])("inline configuration cannot suppress errors: %s", async (comment) => {
  const results = await new ESLint().lintText(
    `${comment}\nexport function unsafe(value: any): any { return value; }`,
    { filePath: sourceFile },
  );
  const messages = results.flatMap((result) => result.messages);
  expect(messages.map((message) => message.ruleId)).toContain(
    "@typescript-eslint/no-explicit-any",
  );
  expect(
    messages.some((message) => message.message.includes("noInlineConfig")),
  ).toBe(true);
});

test.each(["TODO", "FIXME", "XXX"])(
  "rejects incomplete-work marker %s",
  async (marker) => {
    const results = await new ESLint().lintText(
      `// ${marker}: unfinished behavior\nexport const safe = 1;`,
      { filePath: sourceFile },
    );
    expect(
      results.flatMap((result) =>
        result.messages.map((message) => message.ruleId),
      ),
    ).toContain("no-warning-comments");
  },
);

test("accepts ordinary comments and type-check enablement", async () => {
  const results = await new ESLint().lintText(
    "// @ts-check\n// The public constant is intentional.\nexport const safe = 1;",
    { filePath: sourceFile },
  );
  expect(results.flatMap((result) => result.messages)).toEqual([]);
});

test("debugger statements remain errors", async () => {
  const results = await new ESLint().lintText("debugger;", {
    filePath: sourceFile,
  });
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("no-debugger");
});

test("console logging remains an error", async () => {
  const results = await new ESLint().lintText("console.log('unexpected');", {
    filePath: sourceFile,
  });
  expect(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  ).toContain("no-console");
});
