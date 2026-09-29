import { isAbsolute } from "node:path";
import { writeFileSync } from "node:fs";
import type { Reporter, TestModule, TestRunEndReason } from "vitest/node";
import { diagnosticsPath, prepareDiagnostics } from "./runtime-diagnostics.js";

export default class DiagnosticsReporter implements Reporter {
  private root = "";

  onInit(context: { config: { root: string } }): void {
    if (!isAbsolute(context.config.root)) {
      throw new Error("diagnostics root must be absolute");
    }
    this.root = context.config.root;
    prepareDiagnostics(this.root);
  }

  onTestRunEnd(
    modules: readonly Pick<TestModule, "moduleId">[],
    errors: readonly unknown[],
    reason: TestRunEndReason,
  ): void {
    if (!this.root) {
      throw new Error("diagnostics reporter was not initialized");
    }
    writeFileSync(
      diagnosticsPath(this.root),
      JSON.stringify({
        reason,
        unhandledErrors: errors.length,
        files: modules.map((module) => module.moduleId),
      }),
    );
  }
}
