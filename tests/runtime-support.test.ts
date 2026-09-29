import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { verifyRuntimes } from "../quality/runtime-support.js";
import { temporaryDirectories } from "./temporary-directory.js";

const directory = temporaryDirectories("relentless-runtime-support-");
const today = "2026-09-29";

function fixture() {
  const root = directory();
  mkdirSync(join(root, "quality"));
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  const first = { major: "22", start: "2024-04-24", end: "2027-04-30" };
  const policy = {
    source: `https://raw.githubusercontent.com/nodejs/Release/${"a".repeat(40)}/schedule.json`,
    reviewedOn: today,
    reviewBy: "2026-12-28",
    releases: [first, { major: "24", start: "2025-05-06", end: "2028-04-30" }],
  };
  const manifest = { engines: { node: "^22.0.0 || ^24.0.0" } };
  const jobs = {
    analysis: { strategy: { matrix: { node: ["22", "24"] } } },
    compatibility: { strategy: { matrix: { node: ["22", "24"] } } },
  };
  function save(approved: unknown = policy): void {
    writeFileSync(
      join(root, "quality/runtime-support.json"),
      JSON.stringify(approved),
    );
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      JSON.stringify({ jobs }),
    );
  }
  save();
  return { root, policy, manifest, jobs, first, save };
}

test("accepts the exact supported declaration and both complete runtime matrices", () => {
  const f = fixture();
  expect(() => {
    verifyRuntimes(f.root, today);
  }).not.toThrow();
  f.policy.reviewedOn = "2026-09-28";
  f.save();
  expect(() => {
    verifyRuntimes(f.root, today);
  }).not.toThrow();
});

test.each(["2026-09-28", "2026-12-28", "2026-12-29"])(
  "rejects a future or expired review at %s",
  (date) => {
    const f = fixture();
    expect(() => {
      verifyRuntimes(f.root, date);
    }).toThrow("current upstream review");
  },
);

test.each(["start", "end"] as const)(
  "enforces the inclusive start and exclusive %s boundary",
  (field) => {
    const f = fixture();
    const first = f.first;
    first[field] = today;
    f.save();
    if (field === "start") {
      expect(() => {
        verifyRuntimes(f.root, today);
      }).not.toThrow();
      first.start = "2026-09-30";
    } else {
      expect(() => {
        verifyRuntimes(f.root, today);
      }).toThrow("support dates");
      first.end = "2026-09-28";
    }
    f.save();
    expect(() => {
      verifyRuntimes(f.root, today);
    }).toThrow("support dates");
  },
);

test("rejects duplicate release declarations", () => {
  const f = fixture();
  f.policy.releases.push({
    major: "22",
    start: "2024-04-24",
    end: "2027-04-30",
  });
  f.save();
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow("duplicate release");
});

test.each([
  ["1", true],
  ["100", true],
  ["x22", false],
  ["22x", false],
] as const)(
  "validates major %s with otherwise matching engines and matrices",
  (major, valid) => {
    const f = fixture();
    f.first.major = major;
    f.manifest.engines.node = `^${major}.0.0 || ^24.0.0`;
    f.jobs.analysis.strategy.matrix.node[0] = major;
    f.jobs.compatibility.strategy.matrix.node[0] = major;
    f.save();
    const check = () => {
      verifyRuntimes(f.root, today);
    };
    if (valid) {
      expect(check).not.toThrow();
    } else {
      expect(check).toThrow();
    }
  },
);

test.each(["^22.0.0", "^22.0.0 || ^24.0.0 || ^26.0.0", ">=22", ""])(
  "rejects declaration drift %s",
  (engines) => {
    const f = fixture();
    f.manifest.engines.node = engines;
    f.save();
    expect(() => {
      verifyRuntimes(f.root, today);
    }).toThrow("engines differ");
  },
);

test.each(["analysis", "compatibility"] as const)(
  "rejects missing, extra, duplicate and reordered %s matrix entries",
  (job) => {
    const f = fixture();
    for (const versions of [
      ["22"],
      ["22", "24", "26"],
      ["22", "24", "24"],
      ["24", "22"],
    ]) {
      f.jobs[job].strategy.matrix.node = versions;
      f.save();
      expect(() => {
        verifyRuntimes(f.root, today);
      }).toThrow("matrix differs");
    }
  },
);

test.each([
  [
    "source",
    "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json",
  ],
  ["source", "https://example.com/schedule.json"],
  [
    "source",
    `xhttps://raw.githubusercontent.com/nodejs/Release/${"a".repeat(40)}/schedule.json`,
  ],
  [
    "source",
    `https://raw.githubusercontent.com/nodejs/Release/${"a".repeat(40)}/schedule.jsonx`,
  ],
  ["reviewedOn", "2026-02-30"],
  ["reviewBy", "2026-2-1"],
  ["releases", []],
  ["releases", [{ major: "0", start: "2024-04-24", end: "2027-04-30" }]],
  ["releases", [{ major: "22", start: "bad", end: "2027-04-30" }]],
  ["releases", [{ major: "22", start: "2024-04-24", end: "2027-02-29" }]],
  ["extra", true],
])("rejects malformed or unpinned policy %s=%j", (field, value) => {
  const f = fixture();
  f.save({ ...f.policy, [field]: value });
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow();
});

test.each(["2026-02-30", "bad", "2026-09-29T00:00:00Z"])(
  "rejects invalid observation date %s",
  (date) => {
    expect(() => {
      verifyRuntimes(fixture().root, date);
    }).toThrow();
  },
);

test.each([
  "quality/runtime-support.json",
  "package.json",
  ".github/workflows/ci.yml",
])("rejects missing or invalid UTF-8 %s", (name) => {
  const f = fixture();
  const path = join(f.root, name);
  writeFileSync(path, Buffer.from([34, 255, 34]));
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow();
  rmSync(path);
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow();
});

test("rejects duplicate JSON keys, invalid YAML and YAML aliases", () => {
  const f = fixture();
  const path = join(f.root, "quality/runtime-support.json");
  const raw = readFileSync(path, "utf8");
  writeFileSync(path, raw.slice(0, -1) + ',"reviewBy":"2026-12-28"}');
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow("duplicate JSON");
  f.save();
  for (const text of [
    "jobs: [",
    "jobs: 1\njobs: 2",
    "jobs: &jobs {}\nother: *jobs",
  ]) {
    writeFileSync(join(f.root, ".github/workflows/ci.yml"), text);
    expect(() => {
      verifyRuntimes(f.root, today);
    }).toThrow();
  }
});

test("rejects invalid UTF-8 in otherwise valid manifest metadata", () => {
  const f = fixture();
  const path = join(f.root, "package.json");
  const raw = JSON.stringify({ name: "BAD_BYTE", ...f.manifest });
  const [before, after] = raw.split("BAD_BYTE");
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(before ?? ""),
      Buffer.from([255]),
      Buffer.from(after ?? ""),
    ]),
  );
  expect(() => {
    verifyRuntimes(f.root, today);
  }).toThrow("encoded data");
});

test.each(["non-string key", "parser warning", "valid matrix alias"])(
  "rejects YAML %s with otherwise complete valid matrices",
  (fault) => {
    const f = fixture();
    const jobs = JSON.stringify(f.jobs);
    const variants: Record<string, string> = {
      "non-string key": `!!int 1: value\njobs: ${jobs}\n`,
      "parser warning": `notes: !unknown value\njobs: ${jobs}\n`,
      "valid matrix alias": `runtimes: &versions ["22", "24"]\njobs: ${jobs.replaceAll('["22","24"]', "*versions")}\n`,
    };
    writeFileSync(
      join(f.root, ".github/workflows/ci.yml"),
      variants[fault] ?? "",
    );
    expect(() => {
      verifyRuntimes(f.root, today);
    }).toThrow();
  },
);

test("entry observes the UTC day even when local offset crosses midnight", async () => {
  const f = fixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T20:30:00-04:00"));
  vi.spyOn(process, "cwd").mockReturnValue(f.root);
  try {
    vi.resetModules();
    await import("../quality/runtime-support-main.js");
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test("entry fails on the UTC review expiry instead of silently skipping the gate", async () => {
  const f = fixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-28T00:00:00Z"));
  vi.spyOn(process, "cwd").mockReturnValue(f.root);
  try {
    vi.resetModules();
    await expect(import("../quality/runtime-support-main.js")).rejects.toThrow(
      "current upstream review",
    );
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
