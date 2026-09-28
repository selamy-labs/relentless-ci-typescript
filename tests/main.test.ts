import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
vi.mock("node:fs", () => ({ readFileSync: vi.fn(() => "[[1,2]]") }));

test("entry point wires standard streams and the exit status", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const previous = process.exitCode;
  try {
    await import("../src/main.js");
    expect(readFileSync).toHaveBeenCalledWith(0, "utf8");
    expect(output).toHaveBeenCalledWith("[[1,2]]\n");
    expect(error).toHaveBeenCalledWith("");
    expect(process.exitCode).toBe(0);
  } finally {
    process.exitCode = previous;
    vi.restoreAllMocks();
  }
});
