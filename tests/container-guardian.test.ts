import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  guardian,
  liveProcessIds,
  requireNoLive,
  runCommand,
} from "../quality/container-guardian.js";
import { temporaryDirectories } from "./temporary-directory.js";

const repository = temporaryDirectories("relentless-container-processes-");

test("default process inventory reads the active PID namespace", () => {
  expect(() => liveProcessIds()).not.toThrow();
});

function writeProcess(root: string, pid: string, state: string): void {
  const directory = join(root, pid);
  mkdirSync(directory);
  writeFileSync(join(directory, "status"), `Name:\ttest\nState:\t${state}\n`);
}

test("enumerates only live other processes in a PID namespace", () => {
  const root = repository();
  writeProcess(root, "1", "S");
  writeProcess(root, "2", "R");
  writeProcess(root, "3", "S");
  writeProcess(root, "9", "S");
  writeProcess(root, "10", "Z");
  writeProcess(root, "not-a-pid", "S");
  expect(liveProcessIds(root, 3)).toEqual([2, 9]);
  expect(() => {
    requireNoLive(root, 3);
  }).toThrow("2,9");
});

test("allows a clean namespace and a process that disappeared during inspection", () => {
  const root = repository();
  writeProcess(root, "1", "S");
  writeProcess(root, "3", "S");
  mkdirSync(join(root, "4"));
  expect(liveProcessIds(root, 3)).toEqual([]);
  expect(() => {
    requireNoLive(root, 3);
  }).not.toThrow();
});

test("rejects malformed process state instead of treating it as clean", () => {
  const root = repository();
  mkdirSync(join(root, "7"));
  writeFileSync(join(root, "7", "status"), "Name:\ttest\n");
  expect(() => liveProcessIds(root, 3)).toThrow("process state is missing");
});

test("rejects embedded or malformed state lines and keeps numeric PID order", () => {
  const root = repository();
  writeProcess(root, "11", "S");
  writeProcess(root, "2", "R");
  writeProcess(root, "03", "S");
  writeProcess(root, "0", "S");
  writeProcess(root, "a5", "S");
  writeProcess(root, "6a", "S");
  writeProcess(root, "NaN", "S");
  writeFileSync(join(root, "4"), "not a process directory");
  expect(liveProcessIds(root, 1)).toEqual([2, 11]);
  const invalid = repository();
  writeProcess(invalid, "7", "S");
  writeFileSync(join(invalid, "7", "status"), "OtherState:  R\n");
  expect(() => liveProcessIds(invalid, 1)).toThrow("process state is missing");
});

test("reads a state after multiple spaces and rejects non-missing filesystem errors", () => {
  const root = repository();
  writeProcess(root, "5", "S");
  writeFileSync(join(root, "5", "status"), "State:  R\n");
  expect(liveProcessIds(root, 1)).toEqual([5]);
  const broken = repository();
  mkdirSync(join(broken, "8", "status"), { recursive: true });
  expect(() => liveProcessIds(broken, 1)).toThrow();
});

test("runs each locked verifier phase only after a clean process readback", () => {
  const calls: string[] = [];
  const run = vi.fn((command: string, args: string[], timeout: number) => {
    expect(timeout).toBeGreaterThan(0);
    calls.push(`${command} ${args.join(" ")}`);
  });
  const check = vi.fn(() => {
    calls.push("check");
  });
  guardian(run, check);
  expect(calls).toEqual([
    "check",
    "npm ci --ignore-scripts",
    "check",
    "npm run verify:installed",
    "check",
  ]);
  expect(run.mock.calls.map((call) => call[2])).toEqual([600_000, 7_200_000]);
});

test("a failed command prevents later phases", () => {
  const run = vi.fn(() => {
    throw new Error("command failed");
  });
  const check = vi.fn();
  expect(() => {
    guardian(run, check);
  }).toThrow("command failed");
  expect(run).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledTimes(1);
});

test("a leaked process prevents command execution", () => {
  const run = vi.fn();
  const check = vi.fn(() => {
    throw new Error("live descendant");
  });
  expect(() => {
    guardian(run, check);
  }).toThrow("live descendant");
  expect(run).not.toHaveBeenCalled();
});

test("native command execution accepts clean exit and rejects failed outcomes", () => {
  const execute = vi.fn(spawnSync);
  expect(() => {
    runCommand(process.execPath, ["-e", "process.exit(0)"], 5000, execute);
  }).not.toThrow();
  expect(execute.mock.calls[0]).toEqual([
    process.execPath,
    ["-e", "process.exit(0)"],
    { cwd: process.cwd(), stdio: "inherit", timeout: 5000 },
  ]);
  expect(() => {
    runCommand(process.execPath, ["-e", "process.exit(3)"], 5000);
  }).toThrow("container command failed: 3");
  expect(() => {
    runCommand("relentless-missing-tool", [], 5000);
  }).toThrow(/ENOENT/u);
  expect(() => {
    runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], 20);
  }).toThrow();
});

test("invalid timeout reports the specific policy failure", () => {
  expect(() => {
    runCommand(process.execPath, ["-e", "process.exit(0)"], 0);
  }).toThrow("command timeout must be positive and finite");
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
  "rejects invalid container command timeout %s",
  (timeout) => {
    expect(() => {
      runCommand(process.execPath, ["-e", "process.exit(0)"], timeout);
    }).toThrow();
  },
);
