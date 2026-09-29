import { metrics, receipt } from "./duplication-fixture.js";
import { expect, test } from "vitest";
import {
  verifyDuplicationReport,
  type EligibleSource,
} from "../quality/duplication-report.js";

const first: EligibleSource = {
  bytes: 300,
  format: "typescript",
  lines: 8,
  tokens: 60,
};
const second: EligibleSource = { ...first, bytes: 400, lines: 12, tokens: 72 };
const expected = new Map([
  ["/stage/first.ts", first],
  ["/stage/second.ts", second],
]);

test("accepts only complete clean native source and aggregate receipts", () => {
  verifyDuplicationReport(receipt(expected), expected);
});

test("no clone-eligible files still needs an exact empty eligible receipt", () => {
  const value = receipt(expected);
  value.summary.files = [];
  value.summary.folders = [];
  value.summary.totalFiles = 0;
  value.summary.totalFolders = 0;
  value.statistics.formats = {};
  value.statistics.total = metrics(0, 0, 0);
  verifyDuplicationReport(value, new Map());
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow();
});

test.each([null, {}, [], { ...receipt(expected), extra: true }])(
  "rejects missing, unknown or malformed reports: %j",
  (value) => {
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow();
  },
);

test("a duplicate finding cannot be concealed by zero statistics", () => {
  const value = receipt(expected);
  value.duplicates = [{}];
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow();
});

test.each(["bytes", "lines", "tokens"] as const)(
  "rejects substituted per-file %s",
  (field) => {
    const value = receipt(expected);
    const [file] = value.summary.files;
    if (!file) throw new Error("fixture missing");
    file[field] += 1;
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow("enrolled source");
  },
);

test.each(["missing", "duplicate", "substituted"])(
  "rejects %s file inventory",
  (kind) => {
    const value = receipt(expected);
    const [file] = value.summary.files;
    if (!file) throw new Error("fixture missing");
    if (kind === "missing") value.summary.files.pop();
    else if (kind === "duplicate") value.summary.files.push(file);
    else file.path = "/stage/substituted.ts";
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow("inventory");
  },
);

test.each(["sources", "lines", "tokens"] as const)(
  "rejects substituted aggregate %s",
  (field) => {
    const value = receipt(expected);
    value.statistics.total[field] += 1;
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow("statistics");
  },
);

test.each([
  "clones",
  "duplicatedLines",
  "duplicatedTokens",
  "newClones",
  "newDuplicatedLines",
  "percentage",
  "percentageTokens",
] as const)("rejects positive %s even without a duplicate list", (field) => {
  const value = receipt(expected);
  value.statistics.total[field] = 1;
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow();
});

test.each(["totalFiles", "totalFolders"] as const)(
  "rejects incorrect summary %s",
  (field) => {
    const value = receipt(expected);
    value.summary[field] += 1;
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow("totals");
  },
);

test.each(["bytes", "files", "lines", "tokens"] as const)(
  "rejects substituted folder %s",
  (field) => {
    const value = receipt(expected);
    const [folder] = value.summary.folders;
    if (!folder) throw new Error("fixture missing");
    folder[field] += 1;
    expect(() => {
      verifyDuplicationReport(value, expected);
    }).toThrow("folder");
  },
);

test("unknown format metadata cannot replace an enrolled format", () => {
  const value = receipt(expected);
  const [file] = value.summary.files;
  if (!file) throw new Error("fixture missing");
  file.format = "javascript";
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow("enrolled source");
});

test("format membership and per-format statistics must match eligible files", () => {
  const value = receipt(expected);
  value.statistics.formats.javascript = metrics(0, 0, 0);
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow("inventory");
  delete value.statistics.formats.javascript;
  value.statistics.formats.typescript = metrics(1, 20, 132);
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow("statistics");
});

test("missing and duplicate folder paths cannot pass with matching totals", () => {
  const value = receipt(expected);
  value.summary.folders = [];
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow("inventory");
  const complete = receipt(expected);
  complete.summary.folders.push(...complete.summary.folders);
  expect(() => {
    verifyDuplicationReport(complete, expected);
  }).toThrow("inventory");
});

test.each([
  ["lines", 3],
  ["lines", 5.5],
  ["tokens", 49],
  ["tokens", 50.5],
  ["bytes", -1],
  ["complexity", -1],
] as const)("rejects invalid eligible %s=%i", (field, number) => {
  const value = receipt(expected);
  const [file] = value.summary.files;
  if (!file) throw new Error("fixture missing");
  file[field] = number;
  expect(() => {
    verifyDuplicationReport(value, expected);
  }).toThrow();
});

test.each([
  ["lines", 3],
  ["tokens", 49],
] as const)(
  "rejects below-minimum %s despite internally consistent metadata",
  (field, number) => {
    const changed = new Map(expected);
    changed.set("/stage/first.ts", { ...first, [field]: number });
    expect(() => {
      verifyDuplicationReport(receipt(changed), changed);
    }).toThrow();
  },
);

test("accepts exact minima and mixed JavaScript/TypeScript receipts", () => {
  const changed = new Map(expected);
  changed.set("/stage/first.ts", {
    ...first,
    lines: 4,
    tokens: 50,
    format: "javascript",
  });
  verifyDuplicationReport(receipt(changed), changed);
});

test("accepts complete receipts from distinct folders", () => {
  const enrolled = new Map(expected);
  enrolled.delete("/stage/second.ts");
  enrolled.set("/another/second.ts", second);
  verifyDuplicationReport(receipt(enrolled), enrolled);
});
