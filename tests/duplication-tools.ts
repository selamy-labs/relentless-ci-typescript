import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, vi } from "vitest";
import { z } from "zod";
import { receipt } from "./duplication-fixture.js";
import type { EligibleSource } from "../quality/duplication-report.js";
const singleFlags = [
  "--no-gitignore",
  "--absolute",
  "--summary",
  "--no-colors",
  "--no-tips",
];
function parseFlags(flags: string[]) {
  const values: Record<string, string> = {};
  const singles: string[] = [];
  const paths: string[] = [];
  for (let index = 0; index < flags.length; index++) {
    const flag = z.string().parse(flags[index]);
    if (singleFlags.includes(flag)) {
      singles.push(flag);
      continue;
    }
    if (flag.startsWith("--")) {
      values[flag] = z.string().parse(flags[++index]);
      continue;
    }
    paths.push(flag);
  }
  return { values, singles, paths };
}
function policy(flags: ReturnType<typeof parseFlags>) {
  const { values, singles, paths } = flags;
  const combined = values["--min-tokens"] === "50";
  const config = z.string().parse(values["--config"]);
  const output = z.string().parse(values["--output"]);
  expect(singles.sort()).toEqual([...singleFlags].sort());
  expect(values).toEqual({
    "--config": config,
    "--mode": "mild",
    "--format": "javascript,typescript",
    "--min-tokens": combined ? "50" : "1",
    "--min-lines": combined ? "4" : "1",
    "--threshold": combined ? "0" : "100",
    "--max-size": "9007199254740991",
    "--reporters": "json",
    "--summary-top": String(paths.length),
    "--workers": "1",
    "--output": output,
  });
  expect(readFileSync(config, "utf8")).toBe("{}");
  return { combined, output, config };
}
function metadata(bytes: Buffer, text: string): EligibleSource {
  const special = new Map([
    [
      "exact-minima",
      {
        bytes: bytes.length,
        format: "typescript" as const,
        lines: 4,
        tokens: 50,
      },
    ],
    [
      "below-tokens",
      {
        bytes: bytes.length,
        format: "typescript" as const,
        lines: 5,
        tokens: 49,
      },
    ],
    [
      "below-lines",
      {
        bytes: bytes.length,
        format: "typescript" as const,
        lines: 3,
        tokens: 50,
      },
    ],
  ]);
  const boundary = special.get(bytes.toString("utf8"));
  if (boundary) return boundary;
  const large = bytes.toString("utf8") === text;
  return {
    bytes: bytes.length,
    format: "typescript",
    lines: large ? 12 : 1,
    tokens: large ? 72 : 6,
  };
}
function report(paths: string[], text: string, combined: boolean) {
  const enrolled = new Map<string, EligibleSource>();
  for (const path of paths) {
    const bytes = readFileSync(path);
    const source = metadata(bytes, text);
    if (
      bytes.length > 0 &&
      (!combined || (source.tokens >= 50 && source.lines >= 4))
    )
      enrolled.set(path, source);
  }
  return receipt(enrolled);
}
function toolFault(variant: string, config: string): void {
  if (variant === "tool") throw new Error("native tool failed");
  if (variant === "cleanup") {
    rmSync(dirname(config), { recursive: true });
    throw new Error("native cleanup fault");
  }
}
function finding(
  value: ReturnType<typeof receipt>,
  combined: boolean,
  variant: string,
) {
  if (combined && variant === "finding") value.duplicates = [{}];
  return value;
}
function reportText(
  value: ReturnType<typeof receipt>,
  variant: string,
): string {
  return variant === "malformed" ? "{" : JSON.stringify(value);
}
function writeReport(
  root: string,
  text: string,
  flags: ReturnType<typeof parseFlags>,
  variant: string,
) {
  const { combined, output, config } = policy(flags);
  toolFault(variant, config);
  if (variant !== "missing")
    writeFileSync(
      join(output, "jscpd-report.json"),
      reportText(
        finding(report(flags.paths, text, combined), combined, variant),
        variant,
      ),
    );
  if (combined && variant === "changed")
    writeFileSync(join(root, "src", "large.ts"), text + "\n");
}
export function tools(root: string, text: string, variant = "clean") {
  vi.mocked(execFileSync).mockImplementation((command, args, options) => {
    expect(command).toBe("mise");
    expect(options).toEqual({
      cwd: root,
      timeout: 30_000,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const list = z.array(z.string()).parse(args);
    expect(list.slice(0, 5)).toEqual([
      "--yes",
      "--locked",
      "exec",
      "--",
      "jscpd",
    ]);
    if (list[5] === "--version")
      return Buffer.from(
        variant === "version" ? "jscpd 0.0.0" : "jscpd 5.3.3\r\n",
      );
    writeReport(root, text, parseFlags(list.slice(5)), variant);
    return variant === "invalid-output" ? Buffer.from([255]) : Buffer.from("");
  });
}
