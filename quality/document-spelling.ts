import { execFileSync } from "node:child_process";
import { z } from "zod";

const filesSchema = z.array(
  z.strictObject({ type: z.literal("file"), path: z.string() }),
);

function tool(root: string, args: string[]): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    execFileSync("mise", ["--yes", "--locked", "exec", "--", ...args], {
      cwd: root,
      timeout: 30_000,
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );
}

export function verifySpelling(root: string, paths: string[]): void {
  const args = [
    "typos",
    "--isolated",
    "--hidden",
    "--no-ignore",
    "--format",
    "json",
  ];
  const receipt = tool(root, [...args, "--files", ...paths]);
  const files = filesSchema.parse(
    receipt
      .trimEnd()
      .split(/\r?\n/u)
      .map((line): unknown => JSON.parse(line)),
  );
  const found = files.map((file) => file.path).sort();
  if (JSON.stringify(found) !== JSON.stringify([...paths].sort())) {
    throw new Error(
      "native spelling file inventory differs from authored documents",
    );
  }
  const report = tool(root, [...args, ...paths]);
  z.literal("").parse(report);
}
