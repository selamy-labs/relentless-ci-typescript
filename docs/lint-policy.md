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

Type-aware lint also requires every member of a discriminated union in a
`switch`, even when a `default` arm is present. The protected
`@typescript-eslint/switch-exhaustiveness-check` rule rejects a missing case;
native clean and defect probes exercise both sides. External JSON still needs
explicit validation before it can be narrowed to a union type. This static
rule cannot establish that runtime input was validated correctly.

Debugger statements and console logging fail. Ordinary TODO/FIXME/XXX comments
are advisory and remain allowed; suppression directives are still rejected.
Structured stdout/stderr writes at the JSON CLI boundary remain part of its
required protocol. This baseline detects the named static patterns; it does not
prove arbitrary application behavior is finished or ban every conceivable
logging API.

Native API and CLI probes cover clean code, each suppression, disable
directives, ordinary comments, checking enablement and incomplete/debug
patterns. String literals used by those negative probes are parsed as strings
rather than actual directives, and do not require a source exclusion. The full
hosted analysis matrix runs these rules.

## Test execution policy

The same required ESLint gate loads the pinned `@vitest/eslint-plugin` for all
test TypeScript. Focused, disabled, placeholder, prefixed and commented-out
tests are errors, as are imports from `node:test`. These use the native
[Vitest lint rules](https://github.com/vitest-dev/eslint-plugin-vitest). Renamed
imports and literal bracket access are covered by the native probes.

The `relentless/test-execution` complement uses the TypeScript checker's public
API to resolve Vitest declarations. It rejects actual focus, suppression,
conditional and expected-failure modifiers through imports, namespace/constant
aliases, destructuring and supported chains. Literal and constant bracket keys
are covered. The rule applies to all enrolled TypeScript, including configuration.

Direct options on native Vitest calls and nested Vitest-owned configuration
must retain literal types zero for retries/repetitions and false for execution
flags. Ordinary domain properties, fixture data and diagnostic metadata remain
allowed. The checker distinguishes declaration ownership and callable API
members; it does not reserve matching field names throughout a test file.
The same ownership check applies at every nested object, including rejection of
`typecheck.only: true`, which disables runtime tests.

Static matching does not trace arbitrary option variables, spreads, dynamic
keys or type-assertion wrappers. Independent native runtime diagnostics require
zero effective retries,
repetitions and actual attempt counts, with ordinary run mode and no expected
failures. Root retry configuration is checked even when a test overrides it.

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
