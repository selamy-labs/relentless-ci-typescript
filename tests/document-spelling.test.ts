import { execFileSync } from "node:child_process";
import { expect, test, vi, afterEach } from "vitest";
import { verifySpelling } from "../quality/document-spelling.js";

vi.mock("node:child_process", { spy: true });

afterEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.restoreAllMocks();
});

test.each(["\n", "\r\n"])(
  "requires exact native inventory and isolated spelling with %j receipts",
  (newline) => {
    const paths = ["/guide.md", "/README.md"];
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        Buffer.from(
          paths
            .map((path) => JSON.stringify({ type: "file", path }))
            .join(newline) + newline,
        ),
      )
      .mockReturnValueOnce(Buffer.from(""));
    verifySpelling("/root", paths);
    const base = [
      "typos",
      "--isolated",
      "--hidden",
      "--no-ignore",
      "--format",
      "json",
    ];
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      "mise",
      ["--yes", "--locked", "exec", "--", ...base, "--files", ...paths],
      { cwd: "/root", timeout: 30_000, stdio: ["ignore", "pipe", "inherit"] },
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      "mise",
      ["--yes", "--locked", "exec", "--", ...base, ...paths],
      { cwd: "/root", timeout: 30_000, stdio: ["ignore", "pipe", "inherit"] },
    );
  },
);

test.each([
  "",
  "not json",
  "{}",
  '{"type":"file","path":""}',
  '{"type":"file","path":"/wrong.md"}',
  '{"type":"file","path":"/guide.md","extra":true}',
  '{"type":"typo","path":"/guide.md"}',
  '{"type":"file","path":"/guide.md"}\n{"type":"file","path":"/guide.md"}',
])(
  "rejects incomplete, duplicate or malformed file receipts: %j",
  (receipt) => {
    vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from(receipt));
    expect(() => {
      verifySpelling("/root", ["/guide.md"]);
    }).toThrow();
    expect(execFileSync).toHaveBeenCalledTimes(1);
  },
);

test.each([" ", "\n", '{"type":"typo"}'])(
  "nonempty spelling reports fail even if the tool exits zero: %j",
  (report) => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('{"type":"file","path":"/guide.md"}\n'))
      .mockReturnValueOnce(Buffer.from(report));
    expect(() => {
      verifySpelling("/root", ["/guide.md"]);
    }).toThrow();
  },
);

test.each([0, 1])(
  "native failure or timeout at phase %i propagates",
  (phase) => {
    if (phase === 1)
      vi.mocked(execFileSync).mockReturnValueOnce(
        Buffer.from('{"type":"file","path":"/guide.md"}\n'),
      );
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error("native tool failed");
    });
    expect(() => {
      verifySpelling("/root", ["/guide.md"]);
    }).toThrow("native tool failed");
  },
);

test.each([0, 1])("invalid UTF-8 at phase %i is rejected", (phase) => {
  if (phase === 1)
    vi.mocked(execFileSync).mockReturnValueOnce(
      Buffer.from('{"type":"file","path":"/guide.md"}\n'),
    );
  vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from([255]));
  expect(() => {
    verifySpelling("/root", ["/guide.md"]);
  }).toThrow();
});

test("invalid bytes inside valid JSON cannot be replaced into a matching path", () => {
  const path = "/gu\uFFFDide.md";
  vi.mocked(execFileSync)
    .mockReturnValueOnce(
      Buffer.concat([
        Buffer.from('{"type":"file","path":"/gu'),
        Buffer.from([255]),
        Buffer.from('ide.md"}\n'),
      ]),
    )
    .mockReturnValueOnce(Buffer.from(""));
  expect(() => {
    verifySpelling("/root", [path]);
  }).toThrow();
});

test("scope mismatch has an actionable diagnostic", () => {
  vi.mocked(execFileSync).mockReturnValueOnce(
    Buffer.from('{"type":"file","path":"/other.md"}\n'),
  );
  expect(() => {
    verifySpelling("/root", ["/guide.md"]);
  }).toThrow("native spelling file inventory differs from authored documents");
});
