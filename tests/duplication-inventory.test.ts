import { expect, test } from "vitest";
import { duplicationInventory } from "../quality/duplication-inventory.js";
import { receipt } from "./duplication-fixture.js";

const path = "/stage/source.ts";
const bytes = Buffer.from("export const value = 1;\n");
const source = {
  bytes: bytes.length,
  format: "typescript" as const,
  lines: 1,
  tokens: 6,
};
function value() {
  return receipt(new Map([[path, source]]));
}

test("inventory preserves source below clone minima", () => {
  expect(duplicationInventory(value(), path, bytes)).toEqual(source);
});
test.each(["", " \t\n"])(
  "empty authored source is still enrolled: %j",
  (text) => {
    expect(
      duplicationInventory(receipt(new Map()), path, Buffer.from(text)),
    ).toBeUndefined();
  },
);
test("nonempty omitted source and invalid UTF-8 fail", () => {
  expect(() => {
    duplicationInventory(receipt(new Map()), path, bytes);
  }).toThrow("omitted");
  const invalid = value();
  const [file] = invalid.summary.files;
  if (!file) throw new Error("fixture missing");
  file.bytes = 1;
  expect(() => {
    duplicationInventory(invalid, path, Buffer.from([255]));
  }).toThrow(TypeError);
});
test.each(["path", "bytes"] as const)(
  "substituted inventory %s fails",
  (field) => {
    const report = value();
    const file = report.summary.files[0];
    if (!file) throw new Error("fixture missing");
    if (field === "path") file.path += ".other";
    else file.bytes += 1;
    expect(() => {
      duplicationInventory(report, path, bytes);
    }).toThrow("substituted");
  },
);
test("missing report, duplicate entries and dishonest totals fail", () => {
  expect(() => {
    duplicationInventory({}, path, bytes);
  }).toThrow();
  const report = value();
  report.summary.totalFiles += 1;
  expect(() => {
    duplicationInventory(report, path, bytes);
  }).toThrow("totals");
  report.summary.files.push(...report.summary.files);
  expect(() => {
    duplicationInventory(report, path, bytes);
  }).toThrow();
});

test("native format must agree with source extension", () => {
  const report = value();
  const file = report.summary.files[0];
  if (!file) throw new Error("fixture missing");
  file.format = "javascript";
  expect(() => {
    duplicationInventory(report, path, bytes);
  }).toThrow("metadata");
  expect(
    duplicationInventory(
      receipt(
        new Map([["/stage/config.mjs", { ...source, format: "javascript" }]]),
      ),
      "/stage/config.mjs",
      bytes,
    ),
  ).toEqual({ ...source, format: "javascript" });
});
