import { dirname } from "node:path";
import type { EligibleSource } from "../quality/duplication-report.js";
export function metrics(sources: number, lines: number, tokens: number) {
  return {
    clones: 0,
    duplicatedLines: 0,
    duplicatedTokens: 0,
    lines,
    newClones: 0,
    newDuplicatedLines: 0,
    percentage: 0,
    percentageTokens: 0,
    sources,
    tokens,
  };
}

export function receipt(enrolled: Map<string, EligibleSource>) {
  const formats: Partial<
    Record<EligibleSource["format"], ReturnType<typeof metrics>>
  > = {};
  const values = [...enrolled.values()];
  const total = (field: "lines" | "tokens") =>
    values.reduce((sum, value) => sum + value[field], 0);
  for (const format of new Set(values.map((file) => file.format))) {
    const files = values.filter((file) => file.format === format);
    formats[format] = metrics(
      files.length,
      files.reduce((sum, file) => sum + file.lines, 0),
      files.reduce((sum, file) => sum + file.tokens, 0),
    );
  }
  return {
    duplicates: [] as unknown[],
    statistics: {
      detectionDate: "2026-09-29T06:44:18.846Z",
      formats,
      total: metrics(values.length, total("lines"), total("tokens")),
    },
    summary: {
      by: "tokens",
      files: [...enrolled].map(([path, file]) => ({
        ...file,
        path,
        complexity: 1,
        duplicatedLines: 0,
        duplicatedTokens: 0,
      })),
      folders: [
        ...new Set([...enrolled.keys()].map((path) => dirname(path))),
      ].map((path) => {
        const local = [...enrolled]
          .filter(([name]) => dirname(name) === path)
          .map(([, file]) => file);
        return {
          path,
          bytes: local.reduce((sum, file) => sum + file.bytes, 0),
          complexity: local.length,
          duplicatedLines: 0,
          files: local.length,
          lines: local.reduce((sum, file) => sum + file.lines, 0),
          tokens: local.reduce((sum, file) => sum + file.tokens, 0),
        };
      }),
      totalFiles: values.length,
      totalFolders: new Set([...enrolled.keys()].map((path) => dirname(path)))
        .size,
    },
  };
}
