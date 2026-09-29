import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { list } from "tar";
import { z } from "zod";
import policy from "./package-policy.json" with { type: "json" };

const text = z.string().min(1);
const count = z.number().int().nonnegative();
const file = z.object({ path: text, size: count, mode: count });
const reportSchema = z.object({
  name: text,
  version: text,
  filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz(?![\s\S])/u),
  size: count,
  unpackedSize: count,
  entryCount: count,
  shasum: text,
  integrity: text,
  files: z.array(file).min(1),
});
const schema = z.tuple([reportSchema]);
interface Entry {
  bytes: Buffer;
  mode: number;
}
type Report = z.infer<typeof schema>[0];

export function packReport(value: unknown): Report {
  if (Array.isArray(value)) return schema.parse(value)[0];
  const entries = Object.entries(z.record(text, reportSchema).parse(value));
  const [name, report] = z
    .tuple([z.tuple([text, reportSchema])])
    .parse(entries)[0];
  same(name, report.name);
  return report;
}

function same(actual: unknown, expected: unknown): void {
  if (actual !== expected)
    throw new Error("package report or archive differs from public build");
}

function archiveEntries(archive: Buffer): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const parser = list({
    strict: true,
    onReadEntry(entry) {
      same(entry.type, "File");
      if (entries.has(entry.path)) throw new Error("duplicate archive members");
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        const bytes = Buffer.concat(chunks);
        entries.set(entry.path, { bytes, mode: count.parse(entry.mode) });
      });
    },
  });
  parser.end(gunzipSync(archive, { maxOutputLength: policy.tarBytes }));
  return entries;
}

function verifyFiles(
  report: Report,
  entries: Map<string, Entry>,
  expected: Map<string, Buffer>,
): void {
  same(entries.size, expected.size);
  same(report.entryCount, expected.size);
  same(report.files.length, expected.size);
  const reported = new Set<string>();
  let unpacked = 0;
  for (const item of report.files) {
    if (reported.has(item.path))
      throw new Error("duplicate package report paths");
    reported.add(item.path);
    unpacked += verifyFile(item, entries, expected);
  }
  same(report.unpackedSize, unpacked);
  if (unpacked > policy.unpackedBytes)
    throw new Error("unpacked package exceeds size budget");
}

function verifyFile(
  item: z.infer<typeof file>,
  entries: Map<string, Entry>,
  expected: Map<string, Buffer>,
): number {
  const source = z.instanceof(Buffer).parse(expected.get(item.path));
  const entry = entries.get(`package/${item.path}`);
  if (entry === undefined) throw new Error("missing package archive member");
  same(entry.bytes.equals(source), true);
  same(item.size, source.length);
  same(item.mode, policy.fileMode);
  same(entry.mode, policy.fileMode);
  return source.length;
}

export function verifyPackage(
  value: unknown,
  archive: Buffer,
  expected: Map<string, Buffer>,
): void {
  const report = packReport(value);
  const manifest = z
    .object({ name: text, version: text })
    .parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          z.instanceof(Buffer).parse(expected.get("package.json")),
        ),
      ),
    );
  same(report.name, manifest.name);
  same(report.version, manifest.version);
  same(report.size, archive.length);
  same(report.shasum, createHash("sha1").update(archive).digest("hex"));
  same(
    report.integrity,
    `sha512-${createHash("sha512").update(archive).digest("base64")}`,
  );
  if (archive.length > policy.compressedBytes)
    throw new Error("compressed package exceeds size budget");
  verifyFiles(report, archiveEntries(archive), expected);
}
