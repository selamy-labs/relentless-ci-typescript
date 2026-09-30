import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";

const metadata = z.object({
  exports: z.object({
    ".": z.object({
      types: z.literal("./dist/index.d.ts"),
      import: z.literal("./dist/index.js"),
    }),
  }),
  bin: z.object({ "interval-generated-ts": z.literal("dist/main.js") }),
});

export function verifyConsumerMetadata(consumer: string, name: string): void {
  metadata.parse(
    readJson(join(consumer, "node_modules", name, "package.json")),
  );
  if (
    !existsSync(join(consumer, "node_modules", ".bin", "interval-generated-ts"))
  ) {
    throw new Error("installed CLI registration is missing");
  }
}
