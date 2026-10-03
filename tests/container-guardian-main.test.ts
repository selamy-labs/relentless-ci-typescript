import { expect, test, vi } from "vitest";
import { guardian } from "../quality/container-guardian.js";

vi.mock("../quality/container-guardian.js", () => ({ guardian: vi.fn() }));

test("container entrypoint starts the guarded full verifier", async () => {
  await import("../quality/container-guardian-main.js");
  expect(guardian).toHaveBeenCalledExactlyOnceWith();
});
