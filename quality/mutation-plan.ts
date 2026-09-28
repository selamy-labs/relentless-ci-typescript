import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { z } from "zod";

const planSchema = z.object({
  mutantPlans: z.array(
    z.object({
      mutant: z.object({
        fileName: z.string(),
        id: z.string(),
        mutatorName: z.string(),
        replacement: z.string(),
        location: z.object({
          start: z.object({ line: z.number(), column: z.number() }),
          end: z.object({ line: z.number(), column: z.number() }),
        }),
      }),
    }),
  ),
});
type Mutant = z.infer<typeof planSchema>["mutantPlans"][number]["mutant"];
interface FilePlan {
  source: string;
  mutants: Mutant[];
}

function reportPosition(position: { line: number; column: number }) {
  return { line: position.line + 1, column: position.column + 1 };
}

function sourcePath(root: string, fileName: string): string {
  const path = relative(root, fileName).split(sep).join("/");
  if (path === ".." || path.startsWith("../") || isAbsolute(path)) {
    throw new Error("mutation source must be inside the repository");
  }
  return path;
}

/** Bind the pre-execution event inventory to the current source bytes. */
export function mutationPlan(event: unknown, root: string) {
  const files: Record<string, FilePlan> = {};
  for (const { mutant } of planSchema.parse(event).mutantPlans) {
    const path = sourcePath(root, mutant.fileName);
    const file = (files[path] ??= {
      source: readFileSync(mutant.fileName, "utf8"),
      mutants: [],
    });
    file.mutants.push({
      ...mutant,
      location: {
        start: reportPosition(mutant.location.start),
        end: reportPosition(mutant.location.end),
      },
    });
  }
  return { files };
}
