import { execFileSync } from "node:child_process";
import { z } from "zod";

export function run(
  command: string,
  arguments_: string[],
  root: string,
  timeout: number,
): void {
  execFileSync(command, arguments_, { cwd: root, timeout, stdio: "inherit" });
}

export function runNpm(
  arguments_: string[],
  root: string,
  timeout: number,
): void {
  const executable = z.string().min(1).parse(process.env.npm_execpath);
  run(process.execPath, [executable, ...arguments_], root, timeout);
}
