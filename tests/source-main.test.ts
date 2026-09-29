import { expect, test, vi } from "vitest";
import { verifySources, verifyTracked } from "../quality/source-scope.js";
vi.mock("../quality/source-scope.js", () => ({
  verifySources: vi.fn(() => []),
  verifyTracked: vi.fn(),
}));

test("source checker entry validates current source and generated scope", async () => {
  await import("../quality/check-source-main.js");
  expect(verifySources).toHaveBeenCalledExactlyOnceWith(process.cwd());
  expect(verifyTracked).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
