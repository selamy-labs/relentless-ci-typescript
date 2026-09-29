# Type and lint suppressions

The required ESLint command fails on warnings as well as errors and bypasses
ignore patterns. Source enrollment independently rejects unsupported locations
and extensions before linting, so ignored files cannot shrink the declared scope.

Inline ESLint configuration has no effect. The resulting diagnostic is a warning,
which the required `--max-warnings 0` command rejects even when the rest of the
file is clean. See [ESLint's linter options](https://eslint.org/docs/latest/use/configure/configuration-files)
and [CLI warning limits](https://eslint.org/docs/latest/use/command-line-interface).

Compiler error suppressions `@ts-ignore`, `@ts-nocheck` and `@ts-expect-error`
are errors, including comments with a rationale. `@ts-check` remains allowed
because it enables checking. This uses the native
[ban-ts-comment rule](https://typescript-eslint.io/rules/ban-ts-comment/).
No inline exception is currently approved. A future exception needs a narrow
protected policy change plus the trusted maintainer approval mechanism.

Debugger statements, console logging and TODO/FIXME/XXX comments fail. Structured
stdout/stderr writes at the JSON CLI boundary remain part of its required protocol.
This baseline detects the named static patterns; it does not prove arbitrary
application behavior is finished or ban every conceivable logging API.

Native API and CLI probes cover clean code, each suppression, disable directives,
ordinary comments, checking enablement and incomplete/debug patterns. String
literals used by those negative probes are parsed as strings rather than actual
directives, and do not require a source exclusion. Hosted policy approval and
other tools' suppression checks are still pending in this implementation draft.
