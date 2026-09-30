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
  expect(() => {
    runCommand(process.execPath, ["-e", "process.exit(0)"], 5000);
  }).not.toThrow();
  expect(() => {
    runCommand(process.execPath, ["-e", "process.exit(3)"], 5000);
  }).toThrow();
  expect(() => {
    runCommand("relentless-missing-tool", [], 5000);
  }).toThrow();
  expect(() => {
    runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], 20);
  }).toThrow();
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
  "rejects invalid container command timeout %s",
  (timeout) => {
    expect(() => {
      runCommand(process.execPath, [], timeout);
    }).toThrow();
  },
);
