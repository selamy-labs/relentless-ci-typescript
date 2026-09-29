import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";

const argumentsSchema = z.array(z.string().min(1)).min(1);
const policySchema = z.strictObject({
  shellcheck: argumentsSchema,
  shellcheckVersion: z.string().min(1),
  actionlint: argumentsSchema,
  zizmor: argumentsSchema,
});
const cleanReport = z.array(z.unknown()).max(0);

export function workflowPaths(root: string): string[] {
  const directory = join(root, ".github", "workflows");
  const paths = readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || ![".yml", ".yaml"].includes(extname(entry.name))) {
      throw new Error("workflow directory must contain regular YAML workflows");
    }
    return join(directory, entry.name);
  });
  return z.array(z.string()).min(1).parse(paths);
}

function tool(root: string, args: string[]): string {
  const output = execFileSync(
    "mise",
    ["--yes", "--locked", "exec", "--", ...args],
    {
      cwd: root,
      timeout: 30_000,
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}

export function verifyWorkflows(root: string): void {
  const paths = workflowPaths(root);
  const policy = policySchema.parse(
    readJson(join(root, "quality", "workflow-commands.json")),
  );
  const version = tool(root, policy.shellcheck);
  if (
    !version.split(/\r?\n/u).includes(`version: ${policy.shellcheckVersion}`)
  ) {
    throw new Error("required ShellCheck version receipt is missing or wrong");
  }
  tool(root, [...policy.actionlint, ...paths]);
  const report = tool(root, [...policy.zizmor, ...paths]);
  const output = join(root, ".quality-results");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "workflows-security.json"), report);
  cleanReport.parse(JSON.parse(report));
}
