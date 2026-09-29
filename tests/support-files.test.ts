import { temporaryDirectories } from "./temporary-directory.js";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { verifySupportFiles } from "../quality/support-files.js";

const fixture = temporaryDirectories("relentless-support-test-");

test.each([
  ["policy.json", '{"value":1}'],
  ["policy.JSON", '{"value":1}'],
  ["policy.yaml", "value: 1\n"],
  ["policy.yml", "value: 1\n"],
  ["policy.toml", "value = 1\n"],
  ["mise.lock", "value = 1\n"],
])("parses nested authored %s independent of ignore patterns", (name, text) => {
  const root = fixture();
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, ".gitignore"), "nested\n");
  writeFileSync(join(root, "nested", name), text);
  expect(() => {
    verifySupportFiles(root);
  }).not.toThrow();
});

test.each([
  "policy.json",
  "policy.yml",
  "policy.yaml",
  "policy.toml",
  "mise.lock",
])("rejects invalid nested %s independent of ignore patterns", (name) => {
  const root = fixture();
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, ".gitignore"), "nested\n");
  writeFileSync(join(root, "nested", name), "{");
  expect(() => {
    verifySupportFiles(root);
  }).toThrow();
});

test("unrelated documentation and generated outputs are outside format parsing", () => {
  const root = fixture();
  writeFileSync(join(root, "policy.json"), "[]");
  writeFileSync(join(root, "README.md"), "# Documentation\n");
  mkdirSync(join(root, ".quality-results"));
  writeFileSync(join(root, ".quality-results", "bad.json"), "{");
  expect(() => {
    verifySupportFiles(root);
  }).not.toThrow();
});

test.each(["empty", "documentation-only"])(
  "rejects %s support scope",
  (kind) => {
    const root = fixture();
    if (kind === "documentation-only")
      writeFileSync(join(root, "README.md"), "# Docs\n");
    expect(() => {
      verifySupportFiles(root);
    }).toThrow();
  },
);

test("rejects invalid UTF-8 even when replacement characters form valid JSON", () => {
  const root = fixture();
  writeFileSync(join(root, "policy.json"), Buffer.from([34, 255, 34]));
  expect(() => {
    verifySupportFiles(root);
  }).toThrow();
});

test("rejects authored symlinks instead of missing their settings", () => {
  const root = fixture();
  writeFileSync(join(root, "policy.json"), "{}");
  symlinkSync(join(root, "policy.json"), join(root, "alias.json"));
  expect(() => {
    verifySupportFiles(root);
  }).toThrow("symlinks");
});
