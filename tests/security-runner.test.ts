import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../quality/commands.js";
import { readJson, verifySecurity } from "../quality/security.js";

vi.mock("../quality/commands.js", () => ({ run: vi.fn() }));
const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-security-"));
  roots.push(root);
  mkdirSync(join(root, "quality"));
  copyFileSync(
    new URL("../quality/security-commands.json", import.meta.url),
    join(root, "quality", "security-commands.json"),
  );
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "example.ts"), "export {};\n");
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/example": { version: "1.0" } },
    }),
  );
  return root;
}
function destination(args: string[]): string {
  for (const flag of ["--report-path", "--output-file", "--output"]) {
    if (args.includes(flag))
      return z.string().parse(args[args.indexOf(flag) + 1]);
  }
  throw new Error("missing required report option");
}
function report(args: string[], root: string): unknown {
  if (args[4] === "gitleaks") return [];
  if (args[4] === "osv-scanner")
    return {
      results: [
        {
          source: { type: "lockfile", path: join(root, "package-lock.json") },
          packages: [
            { package: { name: "example", version: "1.0", ecosystem: "npm" } },
          ],
        },
      ],
    };
  return {
    results: [],
    errors: [],
    skipped_rules: [],
    paths: { scanned: ["src/example.ts"] },
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

test("all scanners use pinned tools, fresh reports and suppression-resistant options", () => {
  const root = repository();
  mkdirSync(join(root, ".quality-results"));
  for (const name of [
    "history-secrets.json",
    "tree-secrets.json",
    "dependencies.json",
    "static-security.json",
  ])
    writeFileSync(join(root, ".quality-results", name), "stale");
  const received: string[][] = [];
  vi.mocked(run).mockImplementation((command, args, directory, timeout) => {
    expect(command).toBe("mise");
    expect(args.slice(0, 4)).toEqual(["--yes", "--locked", "exec", "--"]);
    expect(directory).toBe(root);
    expect(timeout).toBe(5000);
    expect(existsSync(destination(args))).toBe(false);
    writeFileSync(destination(args), JSON.stringify(report(args, root)));
    received.push(args);
  });
  verifySecurity(root, 5000);
  expect(
    readJson(join(root, ".quality-results", "history-secrets.json")),
  ).toEqual([]);
  expect(readJson(join(root, ".quality-results", "tree-secrets.json"))).toEqual(
    [],
  );
  expect(readJson(join(root, ".quality-results", "dependencies.json"))).toEqual(
    report(z.array(z.string()).parse(received[2]), root),
  );
  expect(
    readJson(join(root, ".quality-results", "static-security.json")),
  ).toEqual(report(z.array(z.string()).parse(received[3]), root));
  expect(received.map((args) => args.slice(4, 6))).toEqual([
    ["gitleaks", "git"],
    ["gitleaks", "dir"],
    ["osv-scanner", "scan"],
    ["opengrep", "scan"],
  ]);
  for (const args of received.slice(0, 2)) {
    expect(args[6]).toBe(".");
    expect(args).toContain("--ignore-gitleaks-allow");
    expect(args).toContain("--redact");
    expect(args[args.indexOf("--gitleaks-ignore-path") + 1]).toBe(
      "quality/gitleaks.ignore",
    );
  }
  const audit = z.array(z.string()).parse(received[2]);
  expect(audit).toContain("--all-vulns");
  expect(audit).toContain("--all-packages");
  expect(audit[audit.indexOf("--config") + 1]).toBe("quality/osv-scanner.toml");
  expect(audit[audit.indexOf("--lockfile") + 1]).toBe(
    join(root, "package-lock.json"),
  );
  const staticScan = z.array(z.string()).parse(received[3]);
  for (const flag of [
    "--error",
    "--strict",
    "--disable-nosem",
    "--disable-version-check",
    "--taint-intrafile",
    "--x-ignore-semgrepignore-files",
    "--no-git-ignore",
  ])
    expect(staticScan).toContain(flag);
  expect(staticScan[staticScan.indexOf("--max-target-bytes") + 1]).toBe("0");
  expect(staticScan.at(-1)).toBe("src/example.ts");
});

test("a zero exit without new output cannot reuse old reports", () => {
  const root = repository();
  mkdirSync(join(root, ".quality-results"));
  writeFileSync(join(root, ".quality-results", "history-secrets.json"), "[]");
  vi.mocked(run).mockImplementationOnce(() => undefined);
  expect(() => {
    verifySecurity(root, 5000);
  }).toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

test("a failed scanner prevents subsequent scanners", () => {
  const root = repository();
  vi.mocked(run).mockImplementationOnce(() => {
    throw new Error("scanner failed");
  });
  expect(() => {
    verifySecurity(root, 5000);
  }).toThrow("scanner failed");
  expect(run).toHaveBeenCalledTimes(1);
});

test("findings fail even after an apparently successful tool exit", () => {
  const root = repository();
  vi.mocked(run).mockImplementationOnce((_command, args) => {
    writeFileSync(destination(args), '[{"RuleID":"a-secret"}]');
  });
  expect(() => {
    verifySecurity(root, 5000);
  }).toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

test("JSON input rejects missing files, invalid encoding and malformed content", () => {
  const root = repository();
  const path = join(root, "report.json");
  expect(() => readJson(path)).toThrow();
  writeFileSync(path, "{");
  expect(() => readJson(path)).toThrow(SyntaxError);
  writeFileSync(
    path,
    new Uint8Array([123, 34, 100, 97, 116, 97, 34, 58, 34, 255, 34, 125]),
  );
  expect(() => readJson(path)).toThrow(TypeError);
  writeFileSync(path, '{"results":[]}');
  expect(readJson(path)).toEqual({ results: [] });
});

test.each(["audit", "sast"])(
  "rejects incomplete %s reports even with zero tool status",
  (kind) => {
    const root = repository();
    vi.mocked(run).mockImplementation((_command, args, directory) => {
      const value = report(args, directory);
      if (kind === "audit" && args[4] === "osv-scanner") {
        writeFileSync(
          destination(args),
          JSON.stringify({
            results: [
              {
                source: {
                  type: "lockfile",
                  path: join(root, "package-lock.json"),
                },
                packages: [],
              },
            ],
          }),
        );
      } else if (kind === "sast" && args[4] === "opengrep") {
        writeFileSync(
          destination(args),
          JSON.stringify({
            results: [],
            errors: [],
            skipped_rules: [],
            paths: { scanned: [] },
          }),
        );
      } else {
        writeFileSync(destination(args), JSON.stringify(value));
      }
    });
    expect(() => {
      verifySecurity(root, 5000);
    }).toThrow("inventory is incomplete");
  },
);

test.each([{}, { history: [] }])(
  "rejects incomplete scanner policy %j",
  (policy) => {
    const root = repository();
    writeFileSync(
      join(root, "quality", "security-commands.json"),
      JSON.stringify(policy),
    );
    expect(() => {
      verifySecurity(root, 5000);
    }).toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);
