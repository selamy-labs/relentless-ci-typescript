import { expect, test, vi } from "vitest";
import {
  MAX_PAGES,
  PAGE_SIZE,
  arrayInventory,
  objectInventory,
  pageRoute,
} from "../quality/trusted-policy/metadata-pages.js";

const ENDPOINT = "repos/owner/repo/pulls/7/reviews";

test("uses fixed pagination on a query-free endpoint", () => {
  expect(pageRoute(ENDPOINT, 2)).toBe(`${ENDPOINT}?per_page=100&page=2`);
  expect(pageRoute(ENDPOINT, MAX_PAGES)).toContain("page=1000");
});

test.each(["?page=2", "#fragment"])("rejects appended %s", (suffix) => {
  expect(() => pageRoute(`${ENDPOINT}${suffix}`, 1)).toThrow(
    "native inventory endpoint contains a query or fragment",
  );
});

test.each([0, MAX_PAGES + 1, 1.5, Number.NaN])(
  "rejects out-of-budget page %s",
  (page) => {
    expect(() => pageRoute(ENDPOINT, page)).toThrow(
      "native inventory page is outside the collection budget",
    );
  },
);

test("reads array pages through an explicit empty terminator", async () => {
  const api = vi.fn((route: string) =>
    Promise.resolve(route.endsWith("page=1") ? ["a", "b"] : []),
  );
  expect(await arrayInventory(api, ENDPOINT)).toEqual(["a", "b"]);
  expect(api).toHaveBeenCalledTimes(2);
});

test.each([null, {}, Array(PAGE_SIZE + 1).fill(0)])(
  "rejects malformed array pages",
  async (page) => {
    await expect(
      arrayInventory(() => Promise.resolve(page), ENDPOINT),
    ).rejects.toThrow("native page must contain at most 100 items");
  },
);

test("accepts exactly one full array page before an empty terminator", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, index) => index);
  const api = vi.fn((route: string) =>
    Promise.resolve(route.endsWith("page=1") ? full : []),
  );
  expect(await arrayInventory(api, ENDPOINT)).toEqual(full);
  expect(api).toHaveBeenCalledTimes(2);
});

test("rejects an unterminated array inventory", async () => {
  const api = vi.fn(() => Promise.resolve([1]));
  await expect(arrayInventory(api, ENDPOINT)).rejects.toThrow("budget");
  expect(api).toHaveBeenCalledTimes(MAX_PAGES);
});

test("collects all counted object pages and checks the count", async () => {
  const api = vi.fn((route: string) =>
    Promise.resolve({
      total_count: 2,
      reviews: route.endsWith("page=1") ? ["a", "b"] : [],
    }),
  );
  expect(await objectInventory(api, ENDPOINT, "reviews")).toEqual([
    2,
    ["a", "b"],
  ]);
  expect(api).toHaveBeenCalledTimes(2);
});

test.each([
  null,
  [],
  7,
  "not an object",
  { total_count: -1, reviews: [] },
  { total_count: 1.5, reviews: [] },
  { total_count: 0, reviews: {} },
])("rejects malformed counted page %j", async (page) => {
  const reason =
    page === null || typeof page !== "object" || Array.isArray(page)
      ? "native object inventory response required"
      : "total_count" in page &&
          typeof page.total_count === "number" &&
          (page.total_count < 0 || !Number.isSafeInteger(page.total_count))
        ? "native inventory count is invalid"
        : "native page must contain at most 100 items";
  await expect(
    objectInventory(() => Promise.resolve(page), ENDPOINT, "reviews"),
  ).rejects.toThrow(reason);
});

test("accepts a native zero-count object inventory", async () => {
  const api = vi.fn(() => Promise.resolve({ total_count: 0, reviews: [] }));
  expect(await objectInventory(api, ENDPOINT, "reviews")).toEqual([0, []]);
  expect(api).toHaveBeenCalledTimes(1);
});

test("rejects count drift between pages", async () => {
  let page = 0;
  const api = () =>
    Promise.resolve(
      ++page === 1
        ? { total_count: 1, reviews: [1] }
        : { total_count: 2, reviews: [] },
    );
  await expect(objectInventory(api, ENDPOINT, "reviews")).rejects.toThrow(
    "native inventory changed during pagination",
  );
});

test("rejects a final count that differs from all collected items", async () => {
  let page = 0;
  const api = () =>
    Promise.resolve({
      total_count: 2,
      reviews: ++page === 1 ? [1] : [],
    });
  await expect(objectInventory(api, ENDPOINT, "reviews")).rejects.toThrow(
    "complete inventory",
  );
});

test("rejects an unterminated object inventory", async () => {
  const api = vi.fn(() =>
    Promise.resolve({ total_count: MAX_PAGES, reviews: [1] }),
  );
  await expect(objectInventory(api, ENDPOINT, "reviews")).rejects.toThrow(
    "budget",
  );
  expect(api).toHaveBeenCalledTimes(MAX_PAGES);
});
