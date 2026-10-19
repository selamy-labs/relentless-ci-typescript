import { isAbsolute } from "node:path";
import { writeFileSync } from "node:fs";
import type { Reporter, TestRunEndReason } from "vitest/node";
import { diagnosticsPath, prepareDiagnostics } from "./runtime-diagnostics.js";
import { testDiagnostics, type DiagnosticModule } from "./test-diagnostics.js";

export default class DiagnosticsReporter implements Reporter {
  private root = "";
  private configuration: unknown;

  onInit(context: {
    config: { root: string; retry?: unknown; allowOnly?: unknown };
  }): void {
    if (!isAbsolute(context.config.root)) {
      throw new Error("diagnostics root must be absolute");
    }
    this.root = context.config.root;
    this.configuration = {
      retry: context.config.retry,
      allowOnly: context.config.allowOnly,
    };
    prepareDiagnostics(this.root);
  }

  onTestRunEnd(
    modules: readonly DiagnosticModule[],
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
        configuration: this.configuration,
        files: modules.map((module) => module.moduleId),
        cases: modules.flatMap(testDiagnostics),
      }),
    );
  }
}
