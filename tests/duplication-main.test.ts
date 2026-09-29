import { expect, test, vi } from "vitest";
import { verifyDuplication } from "../quality/duplication.js";
vi.mock("../quality/duplication.js", () => ({ verifyDuplication: vi.fn() }));
test("duplication entry checks the current repository", async () => {
  await import("../quality/duplication-main.js");
  expect(verifyDuplication).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
