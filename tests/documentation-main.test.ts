import { expect, test, vi } from "vitest";
import { verifyDocumentation } from "../quality/documentation.js";

vi.mock("../quality/documentation.js", () => ({
  verifyDocumentation: vi.fn(),
}));

test("documentation entry point checks the current checkout", async () => {
  await import("../quality/documentation-main.js");
  expect(verifyDocumentation).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
