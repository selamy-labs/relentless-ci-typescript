import Slugger from "github-slugger";
import { lint } from "markdownlint/sync";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";
import { z } from "zod";

export interface MarkdownDocument {
  links: string[];
  anchors: Set<string>;
}

export function verifyMarkdown(name: string, text: string): void {
  z.string().trim().min(1).parse(text);
  const results = lint({ strings: { [name]: text }, noInlineConfig: true });
  z.array(z.never()).parse(results[name]);
}

export function markdownDocument(text: string): MarkdownDocument {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const slugger = new Slugger();
  const anchors = new Set<string>();
  const links: string[] = [];
  visit(tree, "heading", (node) => {
    anchors.add(slugger.slug(toString(node)));
  });
  visit(tree, (node) => {
    if ("url" in node) links.push(node.url);
  });
  return { links, anchors };
}
