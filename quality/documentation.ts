import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";
import { verifyDocumentLink } from "./document-links.js";
import { markdownDocument, verifyMarkdown } from "./document-markdown.js";
import { verifySpelling } from "./document-spelling.js";
import { diskFiles } from "./repository-hygiene.js";

export function verifyDocumentation(root: string): void {
  const output = join(root, ".quality-results");
  rmSync(join(output, "documentation.json"), { force: true });
  const files = new Set(diskFiles(root, root));
  const names = z
    .array(z.string())
    .min(1)
    .parse([...files].filter((name) => extname(name).toLowerCase() === ".md"));
  const documents = new Map(
    names.map((name) => {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        readFileSync(join(root, name)),
      );
      verifyMarkdown(name, text);
      return [name, markdownDocument(text)] as const;
    }),
  );
  const external = new Set(
    [...documents]
      .flatMap(([name, document]) =>
        document.links.map((href) =>
          verifyDocumentLink(root, name, href, files, documents),
        ),
      )
      .filter((url) => url !== undefined),
  );
  verifySpelling(
    root,
    names.map((name) => join(root, name)),
  );
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, "documentation.json"),
    JSON.stringify({ files: names, external: [...external] }),
  );
}
