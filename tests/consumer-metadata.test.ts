import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { verifyConsumerMetadata } from "../quality/consumer-metadata.js";

const roots: string[] = [];
const valid = {
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  bin: { "relentless-example": "dist/main.js" },
};
function fixture(value: unknown = valid): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-consumer-metadata-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules", "sample"), { recursive: true });
  writeFileSync(
    join(root, "node_modules", "sample", "package.json"),
    JSON.stringify(value),
  );
  mkdirSync(join(root, "node_modules", ".bin"));
  writeFileSync(
    join(root, "node_modules", ".bin", "relentless-example"),
    "registered",
  );
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
test("validates public import/type targets and CLI registration", () => {
  verifyConsumerMetadata(fixture(), "sample");
});
test.each([
  null,
  {},
  { bin: valid.bin },
  { exports: valid.exports },
  { ...valid, bin: { "relentless-example": "dist/absent.js" } },
  {
    ...valid,
    exports: {
      ".": { types: "./dist/absent.d.ts", import: "./dist/index.js" },
    },
  },
  {
    ...valid,
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/absent.js" },
    },
  },
])("incomplete or changed public metadata cannot pass %j", (value) => {
  expect(() => {
    verifyConsumerMetadata(fixture(value), "sample");
  }).toThrow();
});
test("missing native CLI registration fails even with correct metadata", () => {
  const root = fixture();
  rmSync(join(root, "node_modules", ".bin", "relentless-example"));
  expect(() => {
    verifyConsumerMetadata(root, "sample");
  }).toThrow("installed CLI registration is missing");
});
