# Type and lint suppressions

The required ESLint command fails on warnings as well as errors and bypasses
ignore patterns. Source enrollment independently rejects unsupported locations
and extensions before linting, so ignored files cannot shrink the declared
scope.

Inline ESLint configuration has no effect. The resulting diagnostic is a
warning, which the required `--max-warnings 0` command rejects even when the
rest of the file is clean. See
[ESLint's linter options](https://eslint.org/docs/latest/use/configure/configuration-files)
and
[CLI warning limits](https://eslint.org/docs/latest/use/command-line-interface).

Compiler error suppressions `@ts-ignore`, `@ts-nocheck` and `@ts-expect-error`
are errors, including comments with a rationale. `@ts-check` remains allowed
because it enables checking. This uses the native
[ban-ts-comment rule](https://typescript-eslint.io/rules/ban-ts-comment/). No
inline exception is currently approved. A future exception needs a narrow
protected policy change plus the trusted maintainer approval mechanism.

Debugger statements, console logging and TODO/FIXME/XXX comments fail.
Structured stdout/stderr writes at the JSON CLI boundary remain part of its
required protocol. This baseline detects the named static patterns; it does not
prove arbitrary application behavior is finished or ban every conceivable
logging API.

Native API and CLI probes cover clean code, each suppression, disable
directives, ordinary comments, checking enablement and incomplete/debug
patterns. String literals used by those negative probes are parsed as strings
rather than actual directives, and do not require a source exclusion. Hosted
policy approval and other tools' suppression checks are still pending in this
implementation draft.

## Test execution policy

The same required ESLint gate loads the pinned `@vitest/eslint-plugin` for all
test TypeScript. Focused, disabled, placeholder, prefixed and commented-out
tests are errors, as are imports from `node:test`. These use the native
[Vitest lint rules](https://github.com/vitest-dev/eslint-plugin-vitest). Renamed
imports and literal bracket access are covered by the native probes.

Additional
[ESLint AST restrictions](https://eslint.org/docs/latest/rules/no-restricted-syntax)
reject `.fails`, `.skipIf` and `.runIf`, including literal bracket access. Test
object properties named `retry` or `repeats` must have literal zero values;
`only`, `skip`, `todo` and `fails` must have literal false values. The
restrictions apply throughout test source, so moving an options object into a
variable does not hide it. They conservatively reserve these property names in
tests; a new fixture that needs conflicting fields requires a reviewed policy
decision.

Ordinary tests, parameterized tables and explicit non-weakening options pass.
Execution uses `allowOnly: false`, zero global retries and a required receipt
that accounts for every enrolled test file, with zero pending or placeholder
results. See the [Vitest test API](https://vitest.dev/api/test) for execution
options. Static rules detect these declared patterns; they are not a proof that
arbitrary dynamically constructed JavaScript cannot conceal behavior.

The runner uses two workers to bound concurrent analyzer startup and memory use.
This limits parallelism without changing discovery, test deadlines or retries.

The test probes pass the imported executable config directly to ESLint, so
mutation tests exercise that same config rather than a separately loaded copy.
One test-side `Linter.Config[]` assertion bridges JSON import types that widen
rule severity strings. Native ESLint validates the configuration when linting;
the assertion does not suppress product errors or bypass a rule.
