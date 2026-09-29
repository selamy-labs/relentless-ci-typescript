import { z } from "zod";

const integer = z.number().int().nonnegative();
const item = z.strictObject({
  bytes: integer,
  complexity: integer,
  duplicatedLines: integer,
  duplicatedTokens: integer,
  format: z.enum(["javascript", "typescript"]),
  lines: z.number().int().min(1),
  path: z.string().min(1),
  tokens: z.number().int().min(1),
});
const inventory = z.object({
  summary: z.object({
    by: z.literal("tokens"),
    files: z.array(item).max(1),
    totalFiles: integer,
  }),
});

function sourceFormat(path: string): "typescript" | "javascript" {
  return path.endsWith(".ts") ? "typescript" : "javascript";
}

export function duplicationInventory(
  value: unknown,
  path: string,
  bytes: Buffer,
) {
  const parsed = inventory.parse(value).summary;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (parsed.totalFiles !== parsed.files.length) {
    throw new Error("duplication inventory totals disagree");
  }
  const [file] = parsed.files;
  if (!file) {
    if (text.trim() !== "") {
      throw new Error("duplication inventory omitted nonempty source");
    }
    return undefined;
  }
  const format = sourceFormat(path);
  if (
    file.path !== path ||
    file.bytes !== bytes.length ||
    file.format !== format
  ) {
    throw new Error("duplication inventory substituted source metadata");
  }
  return {
    bytes: file.bytes,
    format: file.format,
    lines: file.lines,
    tokens: file.tokens,
  };
}
