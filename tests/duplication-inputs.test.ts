import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  duplicationInputs,
  stageDuplicationInputs,
  verifyDuplicationInputs,
} from "../quality/duplication-inputs.js";
import { temporaryDirectories } from "./temporary-directory.js";
const directory = temporaryDirectories("relentless-duplication-inputs-");
function fixture(text = "export const x = 1;\n") {
  const root = directory();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "input.ts"), text);
  return root;
}
test("ignored authored bytes remain enrolled and staged unchanged", () => {
  const root = fixture();
  writeFileSync(join(root, ".gitignore"), "src\n");
  const inputs = duplicationInputs(root);
  const stage = directory();
  expect(stageDuplicationInputs(inputs, stage)).toEqual([
    join(stage, "src", "input.ts"),
  ]);
  expect(readFileSync(join(stage, "src", "input.ts"))).toEqual(
    readFileSync(join(root, "src", "input.ts")),
  );
  expect([...inputs.keys()]).toEqual([join("src", "input.ts")]);
  verifyDuplicationInputs(inputs, duplicationInputs(root));
});
test.each(["start", "end"])("rejects inline suppression %s", (marker) => {
  const root = fixture("// " + "jscpd" + ":ignore-" + marker + "\n");
  expect(() => {
    duplicationInputs(root);
  }).toThrow("suppression");
});
test("invalid UTF-8 cannot be scanned as replacement characters", () => {
  const root = fixture();
  writeFileSync(join(root, "src", "input.ts"), Buffer.from([255]));
  expect(() => {
    duplicationInputs(root);
  }).toThrow();
});
test.each(["content", "added", "substituted-empty"])(
  "source snapshot detects %s changes",
  (kind) => {
    const before = new Map([["file.ts", Buffer.from("")]]);
    const after = new Map(before);
    if (kind === "content") after.set("file.ts", Buffer.from("new"));
    if (kind === "added") after.set("extra.ts", Buffer.alloc(0));
    if (kind === "substituted-empty") {
      after.delete("file.ts");
      after.set("replacement.ts", Buffer.alloc(0));
    }
    expect(() => {
      verifyDuplicationInputs(before, after);
    }).toThrow("changed");
  },
);

test.each([" ", "\t"])(
  "whitespace around the inline delimiter cannot conceal suppression: %j",
  (space) => {
    for (const marker of ["start", "end"]) {
      const root = fixture(
        "// " + "jscpd" + space + ":" + space + "ignore-" + marker + "\n",
      );
      expect(() => {
        duplicationInputs(root);
      }).toThrow("suppression");
    }
  },
);
