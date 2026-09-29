import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { verifyWorkflows, workflowPaths } from "../quality/workflows.js";

vi.mock("node:child_process", { spy: true });
const roots: string[] = [];
const policy = {
  shellcheck: ["shellcheck", "--version"],
  shellcheckVersion: "0.11.0",
  actionlint: ["actionlint"],
  zizmor: ["zizmor", "--offline", "--format", "json"],
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-workflow-test-"));
  roots.push(root);
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, "quality"));
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), "name: Clean\n");
  writeFileSync(
    join(root, "quality", "workflow-commands.json"),
    JSON.stringify(policy),
  );
  return root;
}

function tools(version = "ShellCheck\nversion: 0.11.0\n", report = "[]"): void {
  vi.mocked(execFileSync)
    .mockReturnValueOnce(Buffer.from(version))
    .mockReturnValueOnce(Buffer.from(""))
    .mockReturnValueOnce(Buffer.from(report));
}

afterEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test.each(["\n", "\r\n"])(
  "checks every regular workflow and retains native report with %j lines",
  (newline) => {
    const root = fixture();
    writeFileSync(
      join(root, ".github", "workflows", "other.yaml"),
      "name: Other\n",
    );
    tools(`ShellCheck${newline}version: 0.11.0${newline}`);
    verifyWorkflows(root);
    const paths = [
      join(root, ".github", "workflows", "ci.yml"),
      join(root, ".github", "workflows", "other.yaml"),
    ];
    expect(execFileSync).toHaveBeenCalledTimes(3);
    for (const [index, args] of [
      policy.shellcheck,
      [...policy.actionlint, ...paths],
      [...policy.zizmor, ...paths],
    ].entries()) {
      expect(execFileSync).toHaveBeenNthCalledWith(
        index + 1,
        "mise",
        ["--yes", "--locked", "exec", "--", ...args],
        {
          cwd: root,
          timeout: 30_000,
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
    }
    expect(
      readFileSync(
        join(root, ".quality-results", "workflows-security.json"),
        "utf8",
      ),
    ).toBe("[]");
  },
);

test.each(["readme.md", "ci.YML", "ci.json"])(
  "rejects unenrolled workflow-directory entry %s before tools",
  (name) => {
    const root = fixture();
    rmSync(join(root, ".github", "workflows", "ci.yml"));
    writeFileSync(join(root, ".github", "workflows", name), "name: Other\n");
    expect(() => {
      verifyWorkflows(root);
    }).toThrow("regular YAML");
    expect(execFileSync).not.toHaveBeenCalled();
  },
);

test("repeated verification replaces an existing stale report", () => {
  const root = fixture();
  tools();
  verifyWorkflows(root);
  const path = join(root, ".quality-results", "workflows-security.json");
  writeFileSync(path, '[{"old":"finding"}]');
  tools();
  verifyWorkflows(root);
  expect(execFileSync).toHaveBeenCalledTimes(6);
  expect(readFileSync(path, "utf8")).toBe("[]");
});

test.each(["directory", "symlink"])("rejects workflow %s", (kind) => {
  const root = fixture();
  const path = join(root, ".github", "workflows", "other.yaml");
  if (kind === "directory") mkdirSync(path);
  else symlinkSync(join(root, ".github", "workflows", "ci.yml"), path);
  expect(() => workflowPaths(root)).toThrow("regular YAML");
});

test.each(["empty", "missing"])("rejects %s workflow scope", (kind) => {
  const root = fixture();
  rmSync(join(root, ".github", "workflows", "ci.yml"));
  if (kind === "missing")
    rmSync(join(root, ".github", "workflows"), { recursive: true });
  expect(() => {
    verifyWorkflows(root);
  }).toThrow();
  expect(execFileSync).not.toHaveBeenCalled();
});

test.each(["", "version: 9.0.0\n", "version: 0.11.0-extra\n"])(
  "rejects wrong or absent ShellCheck receipt %j",
  (version) => {
    const root = fixture();
    tools(version);
    expect(() => {
      verifyWorkflows(root);
    }).toThrow("version receipt");
    expect(execFileSync).toHaveBeenCalledTimes(1);
  },
);

test.each(["", "not json", "null", "{}", '[{"finding":"unsafe"}]'])(
  "rejects malformed or finding-bearing native report %j",
  (report) => {
    const root = fixture();
    tools(undefined, report);
    expect(() => {
      verifyWorkflows(root);
    }).toThrow();
    expect(
      readFileSync(
        join(root, ".quality-results", "workflows-security.json"),
        "utf8",
      ),
    ).toBe(report);
  },
);

test.each(["shellcheck", "actionlint", "zizmor"])(
  "propagates %s failure or timeout",
  (failed) => {
    const root = fixture();
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (args?.includes(failed)) throw new Error("native tool failed");
      return Buffer.from("ShellCheck\nversion: 0.11.0\n");
    });
    expect(() => {
      verifyWorkflows(root);
    }).toThrow("native tool failed");
  },
);

test("invalid UTF-8 is not replaced in native receipts", () => {
  const root = fixture();
  vi.mocked(execFileSync)
    .mockReturnValueOnce(
      Buffer.concat([Buffer.from([0xff]), Buffer.from("\nversion: 0.11.0\n")]),
    )
    .mockReturnValueOnce(Buffer.from(""))
    .mockReturnValueOnce(Buffer.from("[]"));
  expect(() => {
    verifyWorkflows(root);
  }).toThrow();
});

test.each([
  null,
  {},
  { ...policy, actionlint: [] },
  { ...policy, shellcheckVersion: "" },
  { ...policy, extra: true },
])("rejects incomplete or expanded policy %j before tools", (value) => {
  const root = fixture();
  writeFileSync(
    join(root, "quality", "workflow-commands.json"),
    JSON.stringify(value),
  );
  expect(() => {
    verifyWorkflows(root);
  }).toThrow();
  expect(execFileSync).not.toHaveBeenCalled();
});
