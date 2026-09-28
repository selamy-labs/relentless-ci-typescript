import { expect, test, vi } from "vitest";
import { checkMutation } from "../quality/check-mutation.js";
vi.mock("../quality/check-mutation.js", () => ({
  checkMutation: vi.fn(() => 1),
}));

test("mutation checker entry invokes the verifier in the current repository", async () => {
  await import("../quality/check-mutation-main.js");
  expect(checkMutation).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
