import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function processState(path: string): string | undefined {
  try {
    const status = readFileSync(path, "utf8");
    const match = /^State:\s+([A-Z])/mu.exec(status);
    if (!match) throw new Error("process state is missing");
    return match[1];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function liveProcessIds(
  root = "/proc",
  own: number = process.pid,
): number[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[1-9]\d*$/u.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((pid) => pid !== 1 && pid !== own)
    .filter((pid) => {
      const state = processState(join(root, String(pid), "status"));
      return state !== undefined && state !== "Z";
    })
    .sort((left, right) => left - right);
}

export function requireNoLive(root?: string, own?: number): void {
  const pids = liveProcessIds(root, own);
  if (pids.length > 0) {
    throw new Error(`container has live descendants: ${pids.join(",")}`);
  }
}

export function runCommand(
  command: string,
  arguments_: string[],
  timeout: number,
): void {
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("command timeout must be positive and finite");
  }
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    stdio: "inherit",
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`container command failed: ${String(result.status)}`);
  }
}

export function guardian(
  run: typeof runCommand = runCommand,
  check: typeof requireNoLive = requireNoLive,
): void {
  check();
  run("npm", ["ci", "--ignore-scripts"], 600_000);
  check();
  run("npm", ["run", "verify:installed"], 7_200_000);
  check();
}
