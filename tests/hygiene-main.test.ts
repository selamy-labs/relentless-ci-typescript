import { expect, test, vi } from "vitest";
import { verifyRepository } from "../quality/repository-hygiene.js";
vi.mock("../quality/repository-hygiene.js", () => ({
  verifyRepository: vi.fn(),
}));

test("repository hygiene entry point checks the current repository", async () => {
  await import("../quality/hygiene-main.js");
  expect(verifyRepository).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
