import { expect, test, vi } from "vitest";
import { verifySupportFiles } from "../quality/support-files.js";

vi.mock("../quality/support-files.js", () => ({ verifySupportFiles: vi.fn() }));

test("support entry point validates the current checkout", async () => {
  await import("../quality/support-main.js");
  expect(verifySupportFiles).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
