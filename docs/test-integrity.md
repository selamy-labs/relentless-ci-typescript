# Test discovery and completed results

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
They first assert a clean analyzer setup before the negative cases. A separate
behavioral witness passes the imported configuration to native ESLint and
requires its test plugin to reject a focused case. This catches missing plugin
registration and an incorrect test-file scope during full mutation.
This gate validates runner results; it does
not establish that every behavior has a meaningful assertion. Property, coverage
and mutation gates provide separate evidence for that requirement.

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
unhandled error count and module paths. The verifier requires reason `passed`,
zero errors and the exact canonical enrolled file inventory. Initialization and
full-verifier preparation both delete stale diagnostic evidence. Missing,
malformed, duplicate, incomplete and error-bearing receipts fail. Native probes
also deliberately set the ignore option true: even though exit status and JSON
success then pass, the independent diagnostic receipt rejects the bypass.

This detects warnings and errors observed during the test lifecycle. General
resource-leak analysis is outside this gate; installed-consumer and full hosted
matrix jobs supply separate execution evidence.
