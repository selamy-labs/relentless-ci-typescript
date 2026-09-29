import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "tar";
import { z } from "zod";
import { afterEach, expect, test } from "vitest";
import { verifyPackage } from "../quality/package-report.js";

const roots: string[] = [];
const expected = new Map([
  ["package.json", Buffer.from('{"name":"sample","version":"0.1.0"}')],
  ["README.md", Buffer.from("Public documentation\n")],
  ["dist/index.js", Buffer.from("export const value = 1;\n")],
]);
function fixture(
  files = expected,
  paths = [...files.keys()].map((path) => `package/${path}`),
  mode = 0o644,
) {
  const root = mkdtempSync(join(tmpdir(), "relentless-package-"));
  roots.push(root);
  for (const [path, bytes] of files) {
    const full = join(root, "package", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, bytes);
    chmodSync(full, mode);
  }
  const archive = z
    .instanceof(Buffer)
    .parse(
      create(
        { cwd: root, sync: true, gzip: true, portable: true },
        paths,
      ).read(),
    );
  const report = [
    {
      name: "sample",
      version: "0.1.0",
      filename: "sample-0.1.0.tgz",
      size: archive.length,
      unpackedSize: [...files.values()].reduce(
        (total, bytes) => total + bytes.length,
        0,
      ),
      shasum: createHash("sha1").update(archive).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      entryCount: files.size,
      files: [...files].map(([path, bytes]) => ({
        path,
        size: bytes.length,
        mode: 420,
      })),
    },
  ];
  return { archive, report };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("validates the actual native archive against public source bytes", () => {
  const { archive, report } = fixture();
  expect(() => {
    verifyPackage(report, archive, expected);
  }).not.toThrow();
});

test.each([
  "name",
  "version",
  "size",
  "unpackedSize",
  "shasum",
  "integrity",
  "entryCount",
])("rejects a dishonest native report field %s", (field) => {
  const { archive, report } = fixture();
  const value = {
    ...report[0],
    [field]:
      field === "name" ||
      field === "version" ||
      field === "shasum" ||
      field === "integrity"
        ? "wrong"
        : 1,
  };
  expect(() => {
    verifyPackage([value], archive, expected);
  }).toThrow("package report or archive differs from public build");
});

test.each(["extra", "missing", "changed"])(
  "rejects %s archive contents",
  (kind) => {
    const files = new Map(expected);
    if (kind === "extra") files.set(".secret", Buffer.from("unexpected"));
    if (kind === "missing") files.delete("README.md");
    if (kind === "changed") files.set("README.md", Buffer.from("changed"));
    const { archive, report } = fixture(files);
    expect(() => {
      verifyPackage(report, archive, expected);
    }).toThrow();
  },
);

test.each([null, {}, [], [null], [{ filename: "../escape.tgz" }]])(
  "rejects malformed pack report %j",
  (report) => {
    expect(() => {
      verifyPackage(report, Buffer.from("bad"), expected);
    }).toThrow();
  },
);

test("rejects invalid gzip even when its reported digest is correct", () => {
  const { report } = fixture();
  const archive = Buffer.from("not gzip");

  expect(() => {
    verifyPackage(receiptFor(archive, report), archive, expected);
  }).toThrow();
});

function receiptFor(
  archive: Buffer,
  report: ReturnType<typeof fixture>["report"],
) {
  return [
    {
      ...report[0],
      size: archive.length,
      shasum: createHash("sha1").update(archive).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    },
  ];
}

test("duplicate paths in both native archive and report fail", () => {
  const { archive, report } = fixture();
  const item = report[0];
  const duplicate = {
    ...item,
    files: [item?.files[0], item?.files[0], item?.files[2]],
  };
  expect(() => {
    verifyPackage([duplicate], archive, expected);
  }).toThrow("duplicate package report paths");
  const repeated = fixture(expected, [
    "package/package.json",
    "package/README.md",
    "package/README.md",
    "package/dist/index.js",
  ]);
  expect(() => {
    verifyPackage(repeated.report, repeated.archive, expected);
  }).toThrow("duplicate archive members");
});

test("a substituted archive path cannot conceal a missing expected member", () => {
  const files = new Map(expected);
  files.delete("README.md");
  files.set("other.md", Buffer.from("Public documentation\n"));
  const changed = fixture(files);
  const { report } = fixture();
  expect(() => {
    verifyPackage(
      receiptFor(changed.archive, report),
      changed.archive,
      expected,
    );
  }).toThrow("missing package archive member");
});

test.each([262144, 262145])(
  "unpacked bytes respect the exact budget %s",
  (size) => {
    const files = new Map(expected);
    const otherBytes =
      [...files.values()].reduce((total, bytes) => total + bytes.length, 0) -
      z.instanceof(Buffer).parse(files.get("dist/index.js")).length;
    files.set("dist/index.js", Buffer.alloc(size - otherBytes));
    const { archive, report } = fixture(files);
    const check = () => {
      verifyPackage(report, archive, files);
    };
    if (size === 262144) expect(check).not.toThrow();
    else expect(check).toThrow("unpacked package exceeds size budget");
  },
);

test.each([65536, 65537])(
  "compressed bytes respect the exact budget %s",
  (size) => {
    const { archive, report } = fixture();
    const padded = Buffer.concat([
      archive,
      Buffer.alloc(size - archive.length),
    ]);
    const check = () => {
      verifyPackage(receiptFor(padded, report), padded, expected);
    };
    if (size === 65536) expect(check).not.toThrow();
    else expect(check).toThrow("compressed package exceeds size budget");
  },
);

test("native decompression rejects expansion beyond its raw TAR budget", () => {
  const { archive, report } = fixture();
  const expanded = gzipSync(
    Buffer.concat([gunzipSync(archive), Buffer.alloc(524288)]),
  );
  expect(() => {
    verifyPackage(receiptFor(expanded, report), expanded, expected);
  }).toThrow();
});

test("directories and malformed native TAR records fail without extraction", () => {
  const directory = fixture(expected, ["package"]);
  expect(() => {
    verifyPackage(directory.report, directory.archive, expected);
  }).toThrow();
  const { archive, report } = fixture();
  const truncated = gzipSync(gunzipSync(archive).subarray(0, 600));
  expect(() => {
    verifyPackage(receiptFor(truncated, report), truncated, expected);
  }).toThrow();
});

test.each(["size", "mode"])("dishonest per-file %s fails", (field) => {
  const { archive, report } = fixture();
  const item = report[0];
  const value = {
    ...item,
    files: item?.files.map((file) => ({ ...file, [field]: 0 })),
  };
  expect(() => {
    verifyPackage([value], archive, expected);
  }).toThrow("package report or archive differs from public build");
});

test.each(["/escaped.tgz", "safe.tgz/escape", "../escape.tgz", "safe.tgz\n"])(
  "unsafe archive filename %j fails independently of other fields",
  (filename) => {
    const { archive, report } = fixture();
    expect(() => {
      verifyPackage([{ ...report[0], filename }], archive, expected);
    }).toThrow();
  },
);

test("an extra actual archive member cannot hide behind an otherwise clean report", () => {
  const files = new Map(expected);
  files.set("hidden.txt", Buffer.from("hidden"));
  const { archive } = fixture(files);
  const { report } = fixture();
  expect(() => {
    verifyPackage(receiptFor(archive, report), archive, expected);
  }).toThrow();
});

test("an omitted report file cannot hide behind a complete actual archive", () => {
  const { archive, report } = fixture();
  const item = report[0];
  expect(() => {
    verifyPackage(
      [{ ...item, files: item?.files.slice(0, 2) }],
      archive,
      expected,
    );
  }).toThrow();
});

test("archive modes must match the protected public mode", () => {
  const { archive, report } = fixture(expected, undefined, 0o600);
  expect(() => {
    verifyPackage(report, archive, expected);
  }).toThrow();
});

test("recoverable native TAR warnings are errors in strict parsing", () => {
  const { archive, report } = fixture();
  const raw = gunzipSync(archive);
  const corrupted = gzipSync(
    Buffer.concat([
      raw.subarray(0, -1024),
      Buffer.alloc(512, 120),
      Buffer.alloc(1024),
    ]),
  );
  expect(() => {
    verifyPackage(receiptFor(corrupted, report), corrupted, expected);
  }).toThrow();
});

test("invalid UTF-8 in otherwise parseable public manifest JSON is forbidden", () => {
  const files = new Map(expected);
  const manifest = Buffer.from('{"name":"sample","version":"0.1.0"}');
  manifest[9] = 255;
  files.set("package.json", manifest);
  const { archive, report } = fixture(files);
  expect(() => {
    verifyPackage(
      [
        {
          ...report[0],
          name: new TextDecoder().decode(manifest).split('"')[3],
        },
      ],
      archive,
      files,
    );
  }).toThrow();
});

test("an empty archive file still requires a complete metadata inventory", () => {
  const files = new Map(expected);
  files.set("README.md", Buffer.alloc(0));
  const { archive, report } = fixture(files);
  verifyPackage(report, archive, files);
  const item = report[0];
  const incomplete = {
    ...item,
    files: item?.files.filter((file) => file.path !== "README.md"),
  };
  expect(() => {
    verifyPackage([incomplete], archive, files);
  }).toThrow("package report or archive differs from public build");
});
