import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { run } from "./commands.js";
import { verifyAudit, verifySast, verifySecrets } from "./security-reports.js";
import { verifySources } from "./source-scope.js";

const resultsDirectory = ".quality-results";
const reports = [
  "history-secrets.json",
  "tree-secrets.json",
  "dependencies.json",
  "static-security.json",
];
const argumentsSchema = z.array(z.string().min(1)).min(1);
const schema = z.object({
  history: argumentsSchema,
  tree: argumentsSchema,
  audit: argumentsSchema,
  sast: argumentsSchema,
});
type Policy = z.infer<typeof schema>;

export function readJson(path: string): unknown {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path)),
  );
}

function tool(
  args: string[],
  root: string,
  timeout: number,
  report: string,
): void {
  const expanded = args.map((arg) =>
    arg
      .replaceAll("{report}", report)
      .replaceAll("{lockfile}", join(root, "package-lock.json")),
  );
  run("mise", ["--yes", "--locked", "exec", "--", ...expanded], root, timeout);
}

function secrets(root: string, timeout: number, policy: Policy): void {
  for (const [args, name] of [
    [policy.history, "history-secrets.json"],
    [policy.tree, "tree-secrets.json"],
  ] as const) {
    const report = join(root, resultsDirectory, name);
    tool(args, root, timeout, report);
    verifySecrets(readJson(report));
  }
}

function dependencies(root: string, timeout: number, policy: Policy): void {
  const report = join(root, resultsDirectory, "dependencies.json");
  const lockfile = join(root, "package-lock.json");
  tool(policy.audit, root, timeout, report);
  verifyAudit(readJson(report), readJson(lockfile), lockfile);
}

function staticAnalysis(
  root: string,
  timeout: number,
  sources: string[],
  policy: Policy,
): void {
  const paths = sources.map((path) =>
    relative(root, path).split(sep).join("/"),
  );
  const report = join(root, resultsDirectory, "static-security.json");
  tool([...policy.sast, ...paths], root, timeout, report);
  verifySast(readJson(report), paths);
}

export function verifySecurity(root: string, timeout: number): void {
  const policy = schema.parse(
    readJson(join(root, "quality", "security-commands.json")),
  );
  const sources = verifySources(root);
  const output = join(root, resultsDirectory);
  mkdirSync(output, { recursive: true });
  for (const name of reports) {
    rmSync(join(output, name), { force: true });
  }
  secrets(root, timeout, policy);
  dependencies(root, timeout, policy);
  staticAnalysis(root, timeout, sources, policy);
}
