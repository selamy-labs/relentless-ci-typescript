import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { verifyDocumentLink } from "../quality/document-links.js";
import { markdownDocument } from "../quality/document-markdown.js";

const root = join(tmpdir(), "relentless-link-root");
const files = new Set([
  "README.md",
  "docs/guide.md",
  "docs/space name.md",
  "src/index.ts",
]);
const documents = new Map([
  ["README.md", markdownDocument("# Home\n")],
  ["docs/guide.md", markdownDocument("# Guide\n\n## Café\n")],
  ["docs/space name.md", markdownDocument("# Space\n")],
]);

test.each([
  "guide.md",
  "guide.md#guide",
  "#caf%C3%A9",
  "../README.md#home",
  "space%20name.md#space",
  "../src/index.ts",
  "guide.md?view=plain",
  "#",
])("accepts owned local document or source link %s", (href) => {
  expect(
    verifyDocumentLink(root, "docs/guide.md", href, files, documents),
  ).toBeUndefined();
});

test.each([
  "https://example.com/guide#heading",
  "http://example.com/guide",
  "mailto:author@example.com",
])("records external link without network access: %s", (href) => {
  expect(
    verifyDocumentLink(root, "docs/guide.md", href, files, documents),
  ).toBe(href);
});

test.each([
  "javascript:alert(1)",
  "data:text/plain,example",
  "ftp://example.com/file",
])("rejects unsupported link protocol: %s", (href) => {
  expect(() =>
    verifyDocumentLink(root, "docs/guide.md", href, files, documents),
  ).toThrow("unsupported documentation link protocol");
});

test.each([
  "missing.md",
  "../docs",
  "../../outside.md",
  "../.quality-results/output.json",
  "../src/index.ts#L1",
  "guide.md#missing",
  "guide.md#HOME",
  "guide.md#%FF",
  "file:///outside.md",
  "//remote/file.md",
])("rejects missing, unenrolled or invalid local link: %s", (href) => {
  expect(() =>
    verifyDocumentLink(root, "docs/guide.md", href, files, documents),
  ).toThrow();
});

test("valid paths with a missing Markdown index cannot pass fragment checks", () => {
  expect(() =>
    verifyDocumentLink(
      root,
      "docs/guide.md",
      "guide.md#guide",
      files,
      new Map(),
    ),
  ).toThrow("heading fragments require a destination Markdown document");
});

test("missing local targets have an actionable diagnostic", () => {
  expect(() =>
    verifyDocumentLink(root, "docs/guide.md", "missing.md", files, documents),
  ).toThrow("local documentation link target is missing or unenrolled");
});

test("missing destination headings have an actionable diagnostic", () => {
  expect(() =>
    verifyDocumentLink(
      root,
      "docs/guide.md",
      "guide.md#absent",
      files,
      documents,
    ),
  ).toThrow("local documentation heading fragment is missing");
});
