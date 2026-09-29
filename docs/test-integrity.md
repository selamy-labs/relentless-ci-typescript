# Test discovery and completed results

The full verifier removes the previous test receipt before running its check
registry. The coverage command runs Vitest's default and JSON reporters and
writes a new `.quality-results/tests.json`. A missing or malformed receipt
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

The supported discovery convention is `tests/**/*.test.ts`. Static detection of
test-like files using other names, per-test retry overrides, and additional
suppression policies remain pending. This gate validates runner results; it does
not establish that every behavior has a meaningful assertion. Property, coverage
and mutation gates provide separate evidence for that requirement.

Remediation is to restore the missing suite, remove focus/skip/todo markers,
repair failures or fix the reporter configuration. Do not reduce discovery scope
or accept incomplete receipts to make verification pass. Hosted policy approval
and the runtime matrix remain pending.
