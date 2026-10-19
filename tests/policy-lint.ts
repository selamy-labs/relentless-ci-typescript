import { ESLint, type Linter } from "eslint";
import eslintConfig from "../eslint.config.mjs";

// JSON import types widen rule severity strings. ESLint validates this native
// config at lint time; the assertion only bridges its public configuration type.
export const overrideConfig = eslintConfig as Linter.Config[];

export async function lintPolicy(
  source: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const results = await new ESLint({
    overrideConfig,
    overrideConfigFile: true,
  }).lintText(source, { filePath });
  return results.flatMap((result) => result.messages);
}
