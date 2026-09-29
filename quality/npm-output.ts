import { execFileSync } from "node:child_process";
import { z } from "zod";

export function npmOutput(
  arguments_: string[],
  root: string,
  timeout: number,
): Buffer {
  const executable = z.string().min(1).parse(process.env.npm_execpath);
  return execFileSync(process.execPath, [executable, ...arguments_], {
    cwd: root,
    timeout,
  });
}
