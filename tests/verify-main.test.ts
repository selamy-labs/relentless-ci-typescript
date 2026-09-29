import { expect, test, vi } from "vitest";
import { verify } from "../quality/pipeline.js";
vi.mock("../quality/pipeline.js", () => ({ verify: vi.fn() }));
test("full verifier entry uses the current repository", async () => {
  await import("../quality/verify-main.js");
  expect(verify).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
