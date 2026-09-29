import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  prepareTests,
  verifyTestReport,
  verifyTests,
} from "../quality/test-report.js";

const roots: string[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), "relentless-tests-"));
  roots.push(path);
  mkdirSync(join(path, "tests", "nested"), { recursive: true });
  writeFileSync(join(path, "tests", "first.test.ts"), "");
  writeFileSync(join(path, "tests", "nested", "second.test.ts"), "");
  return path;
}
afterEach(() => {
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
interface Suite {
  status: string;
  name: string;
  message: string;
  assertionResults: [
    { fullName: string; status: string; failureMessages: string[] },
  ];
}
function suite(name: string): Suite {
  return {
    status: "passed",
    name,
    message: "",
    assertionResults: [
      { fullName: "case", status: "passed", failureMessages: [] },
    ],
  };
}
const expected: [string, string] = [
  "tests/first.test.ts",
  "tests/nested/second.test.ts",
];
function complete() {
  const testResults: [Suite, Suite] = [suite(expected[0]), suite(expected[1])];
  return {
    success: true,
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numTotalTestSuites: 2,
    numPassedTestSuites: 2,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults,
  };
}

test("complete receipts accept reordered paths and nested suite summaries", () => {
  const data = complete();
  data.testResults.reverse();
  verifyTestReport(data, expected, root());
  data.numTotalTestSuites = 3;
  data.numPassedTestSuites = 3;
  verifyTestReport(data, expected, root());
});

test.each([
  "failed",
  "skipped",
  "pending",
  "todo",
  "cancelled",
  "disabled",
  "running",
  "",
])("rejects unsuccessful test or suite status %s", (status) => {
  const data = complete();
  data.testResults[0].status = status;
  expect(() => {
    verifyTestReport(data, expected, root());
  }).toThrow();
  data.testResults[0].status = "passed";
  data.testResults[0].assertionResults[0].status = status;
  expect(() => {
    verifyTestReport(data, expected, root());
  }).toThrow();
});

test.each([
  "numFailedTests",
  "numPendingTests",
  "numTodoTests",
  "numFailedTestSuites",
  "numPendingTestSuites",
])("rejects nonzero %s", (field) => {
  expect(() => {
    verifyTestReport({ ...complete(), [field]: 1 }, expected, root());
  }).toThrow();
});

test.each([
  null,
  {},
  [],
  false,
  { ...complete(), success: false },
  { ...complete(), testResults: [] },
])("rejects malformed or empty report %j", (value) => {
  expect(() => {
    verifyTestReport(value, expected, root());
  }).toThrow();
});

test.each([0, -1, 1.5, "2", null])("rejects invalid test count %s", (count) => {
  expect(() => {
    verifyTestReport({ ...complete(), numTotalTests: count }, expected, root());
  }).toThrow();
});

test("totals and passed counts must equal recorded completed tests", () => {
  for (const field of [
    "numTotalTests",
    "numPassedTests",
    "numPassedTestSuites",
  ]) {
    expect(() => {
      verifyTestReport({ ...complete(), [field]: 3 }, expected, root());
    }).toThrow();
    expect(() => {
      verifyTestReport({ ...complete(), [field]: 1 }, expected, root());
    }).toThrow();
  }
  expect(() => {
    verifyTestReport(
      { ...complete(), numTotalTestSuites: 1, numPassedTestSuites: 1 },
      expected,
      root(),
    );
  }).toThrow();
});

test("each discovered suite must appear exactly once", () => {
  for (const paths of [
    [],
    [expected[0]],
    [...expected, "tests/missing.test.ts"],
    [...expected, expected[0]],
  ]) {
    expect(() => {
      verifyTestReport(complete(), paths, root());
    }).toThrow();
  }
  const data = complete();
  data.testResults[1].name = data.testResults[0].name;
  expect(() => {
    verifyTestReport(data, expected, root());
  }).toThrow("duplicate");
});

test("an empty suite, failure message or missing field fails", () => {
  for (const change of [
    { assertionResults: [] },
    { message: "error" },
    { name: "" },
  ]) {
    const data = complete();
    Object.assign(data.testResults[0], change);
    expect(() => {
      verifyTestReport(data, expected, root());
    }).toThrow();
  }
  const data = complete();
  data.testResults[0].assertionResults[0].failureMessages = [
    "error",
  ] as never[];
  expect(() => {
    verifyTestReport(data, expected, root());
  }).toThrow();
  const incomplete = { ...complete(), numFailedTests: undefined };
  expect(() => {
    verifyTestReport(incomplete, expected, root());
  }).toThrow();
});

test("preparation deletes stale receipt and creates only the expected directory", () => {
  const path = root();
  prepareTests(path);
  const report = join(path, ".quality-results", "tests.json");
  expect(existsSync(join(path, ".quality-results"))).toBe(true);
  writeFileSync(report, JSON.stringify(complete()));
  const diagnostic = join(path, ".quality-results", "diagnostics.json");
  writeFileSync(diagnostic, "stale");
  prepareTests(path);
  expect(existsSync(diagnostic)).toBe(false);
  expect(existsSync(report)).toBe(false);
});

test("fresh report paths must equal independently enrolled test files", () => {
  const path = root();
  mkdirSync(join(path, ".quality-results"));
  const report = join(path, ".quality-results", "tests.json");
  writeFileSync(report, JSON.stringify(complete()));
  const sources = [
    ...expected,
    "src/example.test.ts",
    "tests/helper.ts",
    "quality/example.test.ts",
    "src/tests/hidden.test.ts",
    "tests/hidden.test.ts.helper.ts",
  ].map((name) => join(path, name));
  verifyTests(path, sources);
  expect(() => {
    verifyTests(path, [...sources, join(path, "tests/third.test.ts")]);
  }).toThrow();
  rmSync(report);
  expect(() => {
    verifyTests(path, sources);
  }).toThrow();
  writeFileSync(report, "broken JSON");
  expect(() => {
    verifyTests(path, sources);
  }).toThrow();
});

test("multiple completed cases in a suite are valid", () => {
  const data = complete();
  data.testResults[0].assertionResults.push({
    fullName: "second case",
    status: "passed",
    failureMessages: [],
  });
  data.numTotalTests = 3;
  data.numPassedTests = 3;
  verifyTestReport(data, expected, root());
});

test("diagnostics identify inventory and summary failures", () => {
  expect(() => {
    verifyTestReport(complete(), [], root());
  }).toThrow("test suite inventory is incomplete");
  expect(() => {
    verifyTestReport({ ...complete(), numTotalTests: 3 }, expected, root());
  }).toThrow("test counts disagree with completed results");
  expect(() => {
    verifyTestReport(
      { ...complete(), numTotalTestSuites: 1, numPassedTestSuites: 1 },
      expected,
      root(),
    );
  }).toThrow("suite summary omits test files");
  expect(() => {
    verifyTestReport(
      { ...complete(), numPassedTestSuites: 3 },
      expected,
      root(),
    );
  }).toThrow("suite summary is incomplete");
});
