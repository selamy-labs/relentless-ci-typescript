import { spawnSync } from "node:child_process";
import { z } from "zod";

const outcome = z.object({
  status: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});
type Outcome = z.infer<typeof outcome>;
const complete = outcome.extend({
  error: z.never().optional(),
  signal: z.null(),
});

export function consumerNode(
  args: string[],
  root: string,
  timeout: number,
  input: string,
  expected: Outcome,
): void {
  const actual = complete.parse(
    spawnSync(process.execPath, args, {
      cwd: root,
      timeout,
      input,
      encoding: "utf8",
    }),
  );
  for (const field of ["status", "stdout", "stderr"] as const) {
    if (actual[field] !== expected[field])
      throw new Error(`installed consumer ${field} differs from its contract`);
  }
}
