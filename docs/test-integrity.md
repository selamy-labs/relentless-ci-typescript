# Test discovery and completed results

## Assertion requirement

Every authored `test` or `it` callback must contain a terminal assertion that is
reachable from that test. The assertion may be in the callback itself or in an
assertion helper that the callback calls. The checker follows typed symbols
through import aliases and local helper calls; a matching name with an unrelated
symbol does not count.

The gate recognizes exactly these terminal forms:

- a matcher call on `expect(value)`, including promise modifiers such as
  `resolves` and `rejects`;
- `expect.assertions(count)` and `expect.hasAssertions()`;
- the default callable assertion and named assertion functions exported by
  `node:assert` or `node:assert/strict`, including their imported aliases and
  methods reached through an imported namespace or default binding; and
- `fc.assert(property)` from `fast-check`, including aliased namespace imports
  and an aliased `assert` import, when the property's predicate contains a
  recognized terminal assertion.

A local helper counts only when the test reaches it by a call and its
implementation contains one of those forms. Merely constructing a function that
contains an assertion does not count. An assertion inside a `catch` block that
can complete without rethrowing the caught failure is swallowed and does not
count, whether it appears directly, in a helper or in a property predicate.
`fc.assert` with an assertion-free property therefore does not count.

There are no exemptions, annotations, allowlists or assertion-free test modes.
Add an assertion of the behavior under test, or remove a test that has no
behavioral claim.

The full verifier removes the previous test receipt before running its check
registry. The coverage command retains all configured reporters: default, JSON
and the owned runtime diagnostics reporter. It writes fresh
`.quality-results/tests.json` and `.quality-results/diagnostics.json` receipts.
A missing or malformed receipt
fails, even when the runner exits successfully.

The verifier independently discovers `tests/**/*.test.ts` from the enrolled
source inventory and compares its canonical file paths with the receipt. Every
discovered file must appear exactly once. Empty discovery, missing files,
duplicate files, empty suites and incomplete summaries fail. Canonical paths
account for operating-system aliases such as macOS's temporary directory.

Every recorded test and file must pass. Failed, skipped, pending and todo
results fail; nonzero failure or pending summary counts also fail. The number of
completed test records must equal both total and passed counts. Vitest's suite
count includes nested describe blocks, so it may exceed the file count, but
every reported suite must have passed.

The protected native configuration sets `allowOnly: false`,
`passWithNoTests: false` and `retry: 0`. Focused tests fail even outside CI.
Five isolated native-runner probes exercise clean results, skip, todo, focus and
empty discovery. Additional receipt probes exercise corruption and inventory
mismatches. Faulty fixtures live in temporary projects and do not require
exclusions from owned source.

The supported discovery convention is `tests/**/*.test.ts`. Test-like files
using other names are outside that convention and require an explicit scope
change before they can be credited. The native ESLint probes
reject focused, skipped, alternate Node imports and weakening retry options.
Clean analyzer controls are ordinary tests, so their failures remain individual
test failures during mutation analysis instead of blocking cases in a setup hook.
A separate
behavioral witness passes the imported configuration to native ESLint and
requires its test plugin to reject a focused case. This catches missing plugin
registration and an incorrect test-file scope during full mutation.
The assertion requirement complements these runner-result checks; coverage and
mutation remain separate evidence for the strength of the asserted behavior.

Remediation is to restore the missing suite, remove focus/skip/todo markers,
repair failures or fix the reporter configuration. Do not reduce discovery scope
or accept incomplete receipts to make verification pass. Every hosted full
analysis job runs this same gate.

Runtime warnings are errors. The setup adapter installs a distinct process warning
listener for each test file, raises the original warning, drains queued immediate
diagnostics and removes only its own listener. Cleanup also runs when draining
or finalizer registration fails. Unhandled exceptions and rejected promises are
captured by Vitest. The configured `dangerouslyIgnoreUnhandledErrors` is false.

Vitest 5.0.2's JSON reporter can still report successful tests after an unhandled
error. The native `onTestRunEnd` reporter independently records the reason, actual
unhandled error count, module paths and every public TestCase's effective options
and diagnostic attempt counts. The verifier requires reason `passed`, zero errors,
the exact canonical enrolled file inventory and unique case IDs whose count
matches the independently checked JSON completed-test count. Every case must
have ordinary run mode, zero retries/repetitions and actual attempt counts, and
no expected-failure flag. Root configuration must retain zero retries and disallow
focus. Missing native attempt evidence cannot default to zero. Initialization and
full-verifier preparation both delete stale diagnostic evidence. Missing,
malformed, duplicate, incomplete and error-bearing receipts fail. Native probes
also deliberately set the ignore option true: even though exit status and JSON
success then pass, the independent diagnostic receipt rejects the bypass.

Further native probes reject unused retry allowances, suite-inherited retries,
repetitions, expected failures and nonzero root retries overridden by a test.
A fail-then-pass probe is rejected by both JSON failure history and independent
attempt diagnostics. Final runner success alone is insufficient.

This detects warnings and errors observed during the test lifecycle. General
resource-leak analysis is outside this gate; installed-consumer and full hosted
matrix jobs supply separate execution evidence.
