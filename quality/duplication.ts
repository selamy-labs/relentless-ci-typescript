import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { duplicationInventory } from "./duplication-inventory.js";
import {
  duplicationInputs,
  stageDuplicationInputs,
  verifyDuplicationInputs,
} from "./duplication-inputs.js";
import {
  verifyDuplicationReport,
  type EligibleSource,
} from "./duplication-report.js";
import { readJson } from "./security.js";

function tool(root: string, args: string[]): string {
  const bytes = execFileSync(
    "mise",
    ["--yes", "--locked", "exec", "--", "jscpd", ...args],
    { cwd: root, timeout: 30_000, stdio: ["ignore", "pipe", "inherit"] },
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function scan(
  root: string,
  config: string,
  paths: string[],
  output: string,
  minimum: "1" | "50",
): unknown {
  mkdirSync(output, { recursive: true });
  tool(root, [
    "--config",
    config,
    "--mode",
    "mild",
    "--format",
    "javascript,typescript",
    "--min-tokens",
    minimum,
    "--min-lines",
    minimum === "50" ? "4" : "1",
    "--threshold",
    minimum === "50" ? "0" : "100",
    "--max-size",
    String(Number.MAX_SAFE_INTEGER),
    "--no-gitignore",
    "--absolute",
    "--reporters",
    "json",
    "--summary",
    "--summary-top",
    String(paths.length),
    "--workers",
    "1",
    "--no-colors",
    "--no-tips",
    "--output",
    output,
    ...paths,
  ]);
  return readJson(join(output, "jscpd-report.json"));
}

function inspect(
  root: string,
  config: string,
  stage: string,
  inputs: Map<string, Buffer>,
  output: string,
): Map<string, EligibleSource> {
  const eligible = new Map<string, EligibleSource>();
  for (const [index, [name, bytes]] of [...inputs].entries()) {
    const path = join(stage, name);
    const candidate = duplicationInventory(
      scan(root, config, [path], join(output, "inventory", String(index)), "1"),
      path,
      bytes,
    );
    if (candidate && candidate.lines >= 4 && candidate.tokens >= 50) {
      eligible.set(path, candidate);
    }
  }
  return eligible;
}

export function verifyDuplication(root: string): void {
  const output = join(root, ".quality-results", "duplication");
  rmSync(output, { recursive: true, force: true });
  const inputs = duplicationInputs(root);
  if (tool(root, ["--version"]).trim() !== "jscpd 5.3.3") {
    throw new Error("required jscpd version receipt is missing or wrong");
  }
  const stage = mkdtempSync(join(tmpdir(), "relentless-duplication-"));
  try {
    const config = join(stage, "empty-config.json");
    writeFileSync(config, "{}");
    const paths = stageDuplicationInputs(inputs, stage);
    const eligible = inspect(root, config, stage, inputs, output);
    const report = scan(root, config, paths, join(output, "combined"), "50");
    verifyDuplicationReport(report, eligible);
    verifyDuplicationInputs(inputs, duplicationInputs(root));
    writeFileSync(
      join(output, "verified.json"),
      JSON.stringify({ sources: [...inputs.keys()], eligible: [...eligible] }),
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
