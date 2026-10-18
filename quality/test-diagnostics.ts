import type { TestCase } from "vitest/node";

export interface DiagnosticTest {
  readonly id: string;
  readonly fullName: string;
  readonly options: Pick<
    TestCase["options"],
    "retry" | "repeats" | "fails" | "mode"
  >;
  diagnostic():
    | Pick<
        NonNullable<ReturnType<TestCase["diagnostic"]>>,
        "retryCount" | "repeatCount"
      >
    | undefined;
}

export interface DiagnosticModule {
  readonly moduleId: string;
  readonly children: { allTests(): Iterable<DiagnosticTest> };
}

function caseDiagnostics(test: DiagnosticTest, file: string) {
  const diagnostic = test.diagnostic();
  return {
    id: test.id,
    file,
    name: test.fullName,
    retry: test.options.retry,
    repeats: test.options.repeats ?? 0,
    fails: test.options.fails ?? false,
    mode: test.options.mode,
    retryCount: diagnostic?.retryCount,
    repeatCount: diagnostic?.repeatCount,
  };
}

export function testDiagnostics(module: DiagnosticModule): unknown[] {
  return Array.from(module.children.allTests(), (test) =>
    caseDiagnostics(test, module.moduleId),
  );
}
