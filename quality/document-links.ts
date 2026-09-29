import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MarkdownDocument } from "./document-markdown.js";

const externalProtocols = new Set(["http:", "https:", "mailto:"]);

function verifyFragment(
  target: string,
  hash: string,
  documents: Map<string, MarkdownDocument>,
): void {
  if (hash === "") return;
  const document = documents.get(target);
  if (document === undefined) {
    throw new Error(
      "heading fragments require a destination Markdown document",
    );
  }
  if (!document.anchors.has(decodeURIComponent(hash.slice(1)))) {
    throw new Error("local documentation heading fragment is missing");
  }
}

export function verifyDocumentLink(
  root: string,
  source: string,
  href: string,
  files: Set<string>,
  documents: Map<string, MarkdownDocument>,
): string | undefined {
  const url = new URL(href, pathToFileURL(join(root, source)));
  if (externalProtocols.has(url.protocol)) return url.href;
  if (url.protocol !== "file:") {
    throw new Error("unsupported documentation link protocol");
  }
  const target = relative(root, fileURLToPath(url)).split(sep).join("/");
  if (!files.has(target)) {
    throw new Error("local documentation link target is missing or unenrolled");
  }
  verifyFragment(target, url.hash, documents);
  return undefined;
}
