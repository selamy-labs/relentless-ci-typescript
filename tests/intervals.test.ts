import { expect, test } from "vitest";
import { normalize } from "../src/index.js";

test.each([
  [[], []],
  [[[1, 2]], [[1, 2]]],
  [
    [
      [5, 8],
      [1, 3],
      [2, 6],
    ],
    [[1, 8]],
  ],
  [
    [
      [1, 3],
      [3, 5],
    ],
    [[1, 5]],
  ],
  [
    [
      [1, 3],
      [4, 5],
    ],
    [
      [1, 3],
      [4, 5],
    ],
  ],
  [
    [
      [1, 8],
      [2, 3],
      [1, 8],
    ],
    [[1, 8]],
  ],
  [[[-1_000_000, 1_000_000]], [[-1_000_000, 1_000_000]]],
])("normalizes %j into %j", (value, expected) => {
  expect(normalize(value)).toEqual(expected);
});

test.each(
  [
    null,
    true,
    {},
    "[]",
    [null],
    [[1]],
    [[1, 2, 3]],
    [[1, 1]],
    [[2, 1]],
    [[true, 2]],
    [[0, false]],
    [["1", 2]],
    [[0, null]],
    [[0.5, 2]],
    [[-0.5, 2]],
    [[0, Infinity]],
    [[NaN, 2]],
    [[-1_000_001, 0]],
    [[0, 1_000_001]],
  ].map((value) => ({ value })),
)("rejects invalid intervals $value", ({ value }) => {
  expect(() => normalize(value)).toThrow();
});

test.each([[[]], [[1]], [[1, 2, 3]]])("explains malformed pair %j", (value) => {
  expect(() => normalize([value])).toThrow(
    "each interval must contain exactly two endpoints",
  );
});

test("does not change the input", () => {
  const value = [
    [3, 5],
    [1, 4],
  ];
  expect(normalize(value)).toEqual([[1, 5]]);
  expect(value).toEqual([
    [3, 5],
    [1, 4],
  ]);
});
