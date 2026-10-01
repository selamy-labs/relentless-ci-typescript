import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const root = process.cwd();
const readme = readFileSync(join(root, "README.md"), "utf8");

function verifyExample(document: string): void {
  const section = /^## Example behavior\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(
    document,
  );
  expect(section, "README needs one Example behavior section").not.toBeNull();
  const body = section?.[1] ?? "";
  const fences = [...body.matchAll(/^```sh\n([\s\S]*?)^```$/gm)];
  expect(fences, "README needs one executable shell example").toHaveLength(1);
  const lines = (fences[0]?.[1] ?? "").trim().split("\n");
  expect(lines[0], "README must use the registered build command").toBe(
    "npm run build",
  );
  expect(lines).toHaveLength(2);
  const invocation = /^printf '([^'\n]+)' \| node dist\/main\.js$/.exec(
    lines[1] ?? "",
  );
  expect(invocation, "README must invoke the built JSON CLI").not.toBeNull();
  const input = invocation?.[1] ?? "";
  const claim = /^Output is `([^`\n]+)` followed by a newline\./m.exec(body);
  expect(claim, "README must state the exact output").not.toBeNull();
  const parsed: unknown = JSON.parse(
    readFileSync(join(root, "quality", "checks.json"), "utf8"),
  );
  expect(Array.isArray(parsed)).toBe(true);
  const checks = parsed as unknown[];
  expect(
    checks.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.every((part: unknown) => typeof part === "string"),
    ),
  ).toBe(true);
  const build = checks.findIndex(
    (command) => (command as string[]).join(" ") === "run build",
  );
  const coverage = checks.findIndex(
    (command) => (command as string[]).join(" ") === "run coverage",
  );
  expect(build, "full verification must build before tests").toBeGreaterThan(
    -1,
  );
  expect(coverage).toBeGreaterThan(build);
  const result = spawnSync(process.execPath, ["dist/main.js"], {
    cwd: root,
    input,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe(`${claim?.[1] ?? ""}\n`);
}

test("README example executes with its claimed output", () => {
  verifyExample(readme);
});

test.each([
  ["missing section", "## Example behavior", "## Other behavior"],
  ["wrong command", "npm run build", "npm run other"],
  ["wrong output", "Output is `[[1,8]]`", "Output is `[[0,8]]`"],
  ["changed executable", "node dist/main.js", "node dist/other.js"],
])("README %s cannot pass", (_name, original, changed) => {
  expect(readme).toContain(original);
  expect(() => {
    verifyExample(readme.replace(original, changed));
  }).toThrow();
});
