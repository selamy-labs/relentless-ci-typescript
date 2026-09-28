import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { errorMessage, run } from "../src/cli.js";

test.each([
  { text: "[[5,8],[1,3],[2,6]]", code: 0, stdout: "[[1,8]]\n", stderr: "" },
  { text: "[]", code: 0, stdout: "[]\n", stderr: "" },
  { text: "bad json", code: 2, stdout: "", stderr: "error: invalid JSON\n" },
  { text: "", code: 2, stdout: "", stderr: "error: invalid JSON\n" },
  {
    text: "[[1,1]]",
    code: 2,
    stdout: "",
    stderr: "error: interval start must be less than end\n",
  },
])("renders $text", ({ text, code, stdout, stderr }) => {
  expect(run(text)).toEqual({ code, stdout, stderr });
});

test("formats unusual thrown values", () => {
  expect(errorMessage("failure")).toBe("failure");
  expect(errorMessage(null)).toBe("null");
});

test.each([
  { text: "[[1,2]]", code: 0, stdout: "[[1,2]]\n", stderr: "" },
  {
    text: "null",
    code: 2,
    stdout: "",
    stderr: "error: input must be an array of intervals\n",
  },
])("built executable handles $text", ({ text, code, stdout, stderr }) => {
  const result = spawnSync(process.execPath, ["dist/main.js"], {
    input: text,
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(code);
  expect(result.stdout).toBe(stdout);
  expect(result.stderr).toBe(stderr);
});

test.each([
  { text: "null", message: "input must be an array of intervals" },
  { text: "[[true,2]]", message: "endpoints must be integers" },
  {
    text: "[[0,1000001]]",
    message: "endpoints must be between -1000000 and 1000000",
  },
])("explains invalid input $text", ({ text, message }) => {
  expect(run(text)).toEqual({
    code: 2,
    stdout: "",
    stderr: `error: ${message}\n`,
  });
});
