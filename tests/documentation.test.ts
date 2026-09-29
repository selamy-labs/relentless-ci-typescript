import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { verifyDocumentation } from "../quality/documentation.js";
import { verifySpelling } from "../quality/document-spelling.js";

vi.mock("../quality/document-spelling.js", () => ({ verifySpelling: vi.fn() }));
const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-documentation-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.mocked(verifySpelling).mockReset();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("checks ignored and hidden Markdown and replaces the receipt on repeated runs", () => {
  const root = fixture();
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, ".gitignore"), "docs\n");
  writeFileSync(
    join(root, "README.MD"),
    "# Home\n\n[Guide](docs/.guide.md#guide)\n\n[External](https://example.com/)\n",
  );
  writeFileSync(
    join(root, "docs", ".guide.md"),
    "# Guide\n\n[Home](../README.MD#home)\n\n[External](https://example.com/)\n",
  );
  verifyDocumentation(root);
  const output = join(root, ".quality-results", "documentation.json");
  expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
    files: ["README.MD", "docs/.guide.md"],
    external: ["https://example.com/"],
  });
  expect(verifySpelling).toHaveBeenCalledExactlyOnceWith(root, [
    join(root, "README.MD"),
    join(root, "docs", ".guide.md"),
  ]);
  writeFileSync(output, "stale");
  verifyDocumentation(root);
  expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
    files: ["README.MD", "docs/.guide.md"],
    external: ["https://example.com/"],
  });
});

test.each(["empty", "source-only"])("rejects %s document scope", (kind) => {
  const root = fixture();
  if (kind === "source-only")
    writeFileSync(join(root, "source.ts"), "export {};\n");
  expect(() => {
    verifyDocumentation(root);
  }).toThrow();
  expect(verifySpelling).not.toHaveBeenCalled();
});

test("malformed ignored Markdown fails before spelling", () => {
  const root = fixture();
  writeFileSync(join(root, ".gitignore"), "bad.md\n");
  writeFileSync(join(root, "bad.md"), "#Missing space\n");
  expect(() => {
    verifyDocumentation(root);
  }).toThrow();
  expect(verifySpelling).not.toHaveBeenCalled();
});

test("invalid UTF-8 is not replaced into otherwise valid Markdown", () => {
  const root = fixture();
  writeFileSync(
    join(root, "README.md"),
    Buffer.concat([
      Buffer.from("# Guide\n\n"),
      Buffer.from([255]),
      Buffer.from("\n"),
    ]),
  );
  expect(() => {
    verifyDocumentation(root);
  }).toThrow();
});

test("native spelling failure prevents a success receipt", () => {
  const root = fixture();
  writeFileSync(join(root, "README.md"), "# Guide\n");
  vi.mocked(verifySpelling).mockImplementationOnce(() => {
    throw new Error("typo found");
  });
  expect(() => {
    verifyDocumentation(root);
  }).toThrow("typo found");
  expect(() =>
    readFileSync(join(root, ".quality-results", "documentation.json")),
  ).toThrow();
});

test("a failed check removes the previous success receipt", () => {
  const root = fixture();
  writeFileSync(join(root, "README.md"), "# Guide\n");
  verifyDocumentation(root);
  const receipt = join(root, ".quality-results", "documentation.json");
  expect(readFileSync(receipt, "utf8")).toContain("README.md");
  writeFileSync(join(root, "README.md"), "#Malformed\n");
  expect(() => {
    verifyDocumentation(root);
  }).toThrow();
  expect(() => readFileSync(receipt)).toThrow();
});
