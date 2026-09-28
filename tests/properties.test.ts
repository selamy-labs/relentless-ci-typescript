import fc from "fast-check";
import { expect, test } from "vitest";
import { normalize } from "../src/index.js";
import type { Interval } from "../src/validation.js";

const interval = fc
  .tuple(fc.integer({ min: -20, max: 19 }), fc.integer({ min: 1, max: 20 }))
  .map(([start, length]): Interval => [start, start + length]);
const collections = fc.array(interval, { maxLength: 30 });

function points(value: Interval[]): Set<number> {
  return new Set(
    value.flatMap(([start, end]) =>
      Array.from({ length: end - start }, (_, offset) => start + offset),
    ),
  );
}

test("preserves represented points against an independent bounded model", () => {
  fc.assert(
    fc.property(collections, (value) => {
      expect(points(normalize(value))).toEqual(points(value));
    }),
  );
});

test("normalization is idempotent", () => {
  fc.assert(
    fc.property(collections, (value) => {
      const once = normalize(value);
      expect(normalize(once)).toEqual(once);
    }),
  );
});

test("input order is irrelevant", () => {
  const permutations = collections.chain((value) =>
    fc.tuple(
      fc.constant(value),
      fc.shuffledSubarray(value, {
        minLength: value.length,
        maxLength: value.length,
      }),
    ),
  );
  fc.assert(
    fc.property(permutations, ([value, shuffled]) => {
      expect(normalize(shuffled)).toEqual(normalize(value));
    }),
  );
});

test("output is sorted, nonempty, disjoint and nonadjacent", () => {
  fc.assert(
    fc.property(collections, (value) => {
      const result = normalize(value);
      expect(result.every(([start, end]) => start < end)).toBe(true);
      expect(
        result
          .slice(1)
          .every(([start], index) => start > (result[index]?.[1] ?? Infinity)),
      ).toBe(true);
    }),
  );
});
