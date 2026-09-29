import { expect, test } from "vitest";
import { verifyPathNames, verifyTextKind } from "../quality/portable-paths.js";

test("accepts shared directories and distinct portable names", () => {
  expect(() => {
    verifyPathNames([
      "src/a.ts",
      "srca.TS",
      "src/nested/b.ts",
      "src/nested/c.ts",
      ".github/workflows/ci.yml",
      "docs/é.md",
      "docs/spaced name.md",
      "LICENSE",
      "README.md",
      "uncommon/C0.txt",
    ]);
  }).not.toThrow();
});

test.each([{ names: [] }, { names: ["src/a.ts", "src/a.ts"] }])(
  "rejects empty or duplicated inventory %s",
  ({ names }) => {
    expect(() => {
      verifyPathNames(names);
    }).toThrow("empty or duplicated");
  },
);

test.each([
  { names: ["src/A.ts", "src/a.ts"] },
  { names: ["src/Nested/a.ts", "src/nested/b.ts"] },
  { names: ["src/é.ts", "src/e\u0301.ts"] },
  { names: ["src/straße.ts", "src/STRASSE.ts"] },
])("rejects normalized file and directory collisions %s", ({ names }) => {
  expect(() => {
    verifyPathNames(names);
  }).toThrow("collide");
});

test.each([
  "<",
  ">",
  ":",
  '"',
  "\\",
  "|",
  "?",
  "*",
  "\0",
  "\u001f",
  "\n",
  "\r",
  "\u0085",
])("rejects forbidden component character %s", (character) => {
  expect(() => {
    verifyPathNames([`src/a${character}b.ts`]);
  }).toThrow("unsupported component");
});

test.each([
  "/absolute.ts",
  "src//file.ts",
  "../file.ts",
  "src/./file.ts",
  "src/../file.ts",
  "src/file.ts.",
  "src/file.ts ",
  "src/file.ts\u00a0",
  "src/",
])("rejects nonportable path %s", (name) => {
  expect(() => {
    verifyPathNames([name]);
  }).toThrow("unsupported component");
});

const devices = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...["COM", "LPT"].flatMap((prefix) =>
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].map(
      (number) => prefix + number,
    ),
  ),
];
test.each(
  devices.flatMap((name) => [
    name,
    name.toLowerCase() + ".ts",
    name + " .extra.ts",
  ]),
)("rejects reserved Windows device component %s", (name) => {
  expect(() => {
    verifyPathNames([`src/${name}/file.ts`]);
  }).toThrow("device name");
});

test.each([
  "CONSOLE",
  "COM0",
  "COM10",
  "LPT0",
  "LPT10",
  "ACON",
  "BPRN",
  "AUXILIARY",
  "NULdata",
  "COM4data",
  "LPT1data",
])("accepts nondevice prefix or suffix %s", (name) => {
  expect(() => {
    verifyPathNames([`src/${name}.ts`]);
  }).not.toThrow();
});

test.each([
  "ts",
  "mjs",
  "json",
  "md",
  "toml",
  "lock",
  "yml",
  "yaml",
  "txt",
  "ignore",
])("enrolls text extension %s", (extension) => {
  expect(() => {
    verifyTextKind(`directory/file.${extension}`);
  }).not.toThrow();
  expect(() => {
    verifyTextKind(`directory/file.${extension.toUpperCase()}`);
  }).not.toThrow();
});

test.each(["LICENSE", ".gitignore", ".npmrc"])(
  "enrolls special text name %s",
  (name) => {
    expect(() => {
      verifyTextKind(`directory/${name}`);
    }).not.toThrow();
  },
);

test.each(["unknown", "image.png", "native.dll", "source.go", "data.bin"])(
  "rejects unactivated file kind %s",
  (name) => {
    expect(() => {
      verifyTextKind(name);
    }).toThrow("protected text inventory");
  },
);
