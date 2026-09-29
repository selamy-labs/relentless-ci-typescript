import { expect, test } from "vitest";
import {
  markdownDocument,
  verifyMarkdown,
} from "../quality/document-markdown.js";

test("accepts native Markdown structure", () => {
  expect(() => {
    verifyMarkdown("guide.md", "# Guide\n\nClear documentation.\n");
  }).not.toThrow();
});

test.each([
  "",
  "\uFEFF",
  "\n",
  " \n\n",
  "#Missing space\n",
  "# Guide\n\n### Skipped level\n",
  "# Guide\n\n[Missing]()\n",
  "# Guide\n\n[Missing](#absent)\n",
  "# Guide\n\n<!-- markdownlint-disable -->\n\n### Skipped level\n",
])("native Markdown defects cannot be suppressed: %j", (text) => {
  expect(() => {
    verifyMarkdown("guide.md", text);
  }).toThrow();
});

test("extracts CommonMark and GFM links without treating code as a link", () => {
  const document = markdownDocument(
    "# Guide\n\n[Inline](one.md) ![Image](image.png) [Reference][ref]\n\n" +
      "[ref]: two.md\n\n| Column |\n| --- |\n| [Table](table.md) |\n\n" +
      "`[Code](missing.md)`\n\n```md\n[Code](also-missing.md)\n```\n",
  );
  expect(document.links).toEqual(["one.md", "image.png", "two.md", "table.md"]);
});

test("native GitHub slugs include formatting, Unicode, GFM and repeated headings", () => {
  const document = markdownDocument(
    "# Hello, **World**!\n\n## Hello, **World**!\n\n" +
      "## Café\n\n## ~~Old~~ `Code`\n\n## Different\n",
  );
  expect([...document.anchors]).toEqual([
    "hello-world",
    "hello-world-1",
    "café",
    "old-code",
    "different",
  ]);
});

test("links decode Markdown entities and escapes through the native parser", () => {
  expect(markdownDocument("[File](one&amp;two.md)\n").links).toEqual([
    "one&two.md",
  ]);
});

test("the native GFM extension resolves bare URL and email autolinks", () => {
  expect(
    markdownDocument("www.example.com and author@example.com\n").links,
  ).toEqual(["http://www.example.com", "mailto:author@example.com"]);
});

test("GFM autolink targets exclude strikethrough markers", () => {
  const document = markdownDocument(
    "~~www.example.com~~ and www.example.com/path~~\n",
  );
  expect(document.links).toEqual([
    "http://www.example.com",
    "http://www.example.com/path",
  ]);
});
