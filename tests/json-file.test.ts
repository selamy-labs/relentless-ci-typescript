import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { expect, test } from "vitest";
import { readJson } from "../quality/json-file.js";

const scalar = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string(),
);
const values = fc.oneof(
  scalar,
  fc.array(scalar, { maxLength: 8 }),
  fc.dictionary(fc.string({ maxLength: 12 }), scalar, { maxKeys: 8 }),
);

test("reads generated JSON values through UTF-8 files without changing their meaning", () => {
  fc.assert(
    fc.property(values, (value) => {
      const root = mkdtempSync(join(tmpdir(), "relentless-json-"));
      try {
        const path = join(root, "value.json");
        writeFileSync(path, ` \n${JSON.stringify(value)}\t`);
        expect(readJson(path)).toEqual(value);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});

test("preserves Unicode, BOM decoding and native duplicate-key semantics", () => {
  const root = mkdtempSync(join(tmpdir(), "relentless-json-native-"));
  try {
    const path = join(root, "value.json");
    writeFileSync(
      path,
      '\uFEFF{"text":"é ☃","key":1,"key":2,"number":-0,"fraction":1.25}',
    );
    expect(readJson(path)).toEqual({
      text: "é ☃",
      key: 2,
      number: -0,
      fraction: 1.25,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing files, malformed JSON and invalid UTF-8", () => {
  const root = mkdtempSync(join(tmpdir(), "relentless-json-invalid-"));
  try {
    const path = join(root, "value.json");
    expect(() => readJson(path)).toThrow();
    writeFileSync(path, "{");
    expect(() => readJson(path)).toThrow(SyntaxError);
    writeFileSync(path, new Uint8Array([0xff]));
    expect(() => readJson(path)).toThrow(TypeError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
