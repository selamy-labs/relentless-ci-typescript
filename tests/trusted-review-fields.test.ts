import { expect, test } from "vitest";
import {
  digest,
  identifier,
  rationale,
  record,
  text,
  timestamp,
} from "../quality/trusted-policy/review-fields.js";

test("accepts only native metadata objects", () => {
  expect(record({ id: 2 })).toEqual({ id: 2 });
  for (const value of [null, [], 1, "object"]) {
    expect(() => record(value)).toThrow();
  }
});

test("accepts only safe positive platform identities", () => {
  expect(identifier(2)).toBe(2);
  for (const value of [
    true,
    false,
    0,
    -1,
    1.5,
    "2",
    null,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    expect(() => identifier(value)).toThrow();
  }
});

test("requires nonempty text and exact Git digests", () => {
  expect(text("hello")).toBe("hello");
  expect(digest("a".repeat(40))).toBe("a".repeat(40));
  for (const value of ["", null, 42]) {
    expect(() => text(value)).toThrow();
  }
  for (const value of [
    "",
    null,
    "a".repeat(39),
    "A".repeat(40),
    "g".repeat(40),
  ]) {
    expect(() => digest(value)).toThrow();
  }
});

test("requires real UTC second-resolution submission dates", () => {
  expect(timestamp("2024-02-29T00:00:00Z")).toBe(Date.UTC(2024, 1, 29));
  for (const value of [
    "",
    null,
    "2026-09-29",
    "2026-09-29T15:00:00+00:00",
    "2026-02-30T15:00:00Z",
    "2026-13-01T00:00:00Z",
  ]) {
    expect(() => timestamp(value)).toThrow();
  }
});

test("requires explicit, substantial policy rationale", () => {
  const body = `Policy rationale: ${"x".repeat(30)}`;
  expect(rationale(`  ${body}  `)).toBe(body);
  for (const value of [
    null,
    "",
    "Approved",
    "Policy rationale: too short",
    `prefix ${body}`,
  ]) {
    expect(() => rationale(value)).toThrow();
  }
});

test("reports malformed native fields at their parsing boundary", () => {
  expect(() => record(null)).toThrow("native metadata object required");
  expect(() => identifier(0)).toThrow("positive platform identity required");
  expect(() => text("")).toThrow("nonempty native metadata text required");
  expect(() => digest("a".repeat(39))).toThrow(
    "full Git commit identity required",
  );
  expect(() => timestamp("2026-02-30T15:00:00Z")).toThrow(
    "native UTC submission timestamp is invalid",
  );
  expect(() => timestamp(" 2026-09-29T15:00:00Z")).toThrow(
    "native UTC submission timestamp required",
  );
  expect(() => rationale("Policy rationale: short")).toThrow(
    "approval needs explicit maintainer policy rationale",
  );
});

test("digest and UTC timestamp reject leading or trailing native data", () => {
  const sha = "a".repeat(40);
  expect(() => digest(`x${sha}`)).toThrow("full Git commit identity required");
  expect(() => digest(`${sha}x`)).toThrow("full Git commit identity required");
  expect(() => timestamp("x2026-09-29T15:00:00Z")).toThrow(
    "native UTC submission timestamp required",
  );
  expect(() => timestamp("2026-09-29T15:00:00Zx")).toThrow(
    "native UTC submission timestamp required",
  );
});

test("rationale measures substantive content after trimming", () => {
  const prefix = "Policy rationale:";
  expect(() => rationale(`${prefix}    ${"x".repeat(29)}`)).toThrow(
    "approval needs explicit maintainer policy rationale",
  );
  expect(rationale(`${prefix}    ${"x".repeat(30)}`)).toBe(
    `${prefix}    ${"x".repeat(30)}`,
  );
});
