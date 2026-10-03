# Mutation verification

After `npm ci`, run `npm run mutation`. This builds the example and checker,
executes every configured Stryker mutant, and validates raw events. The same
command is intended for local and hosted verification.

The scope is all TypeScript in `src/` and `quality/`, including the Vitest
adapter, plus the executable root ESLint configuration and dependency-policy
entry points. Tests are
exercised rather than mutated. There are no operator or equivalent-mutant
exclusions. Incremental reuse is disabled. Stryker works in its isolated
sandbox.

The native Vitest runner selects related tests through its module graph. Probes
that exercise executable configuration import and pass that config directly to
the analyzer, so mutation of the config enrolls the probes and changes what they
verify. Filesystem-only automatic configuration loading does not establish that
dependency. Separate native CLI probes also verify the required commands.

Stryker's normal score can credit timeouts. Our additional checker accepts only
raw `Killed` outcomes. `Timeout`, `RuntimeError`, `CompileError`, `NoCoverage`,
`Survived`, ignored and pending outcomes all fail. Invalid mutants are therefore
reported as failures requiring investigation, never counted as kills.

The full verifier allows up to 90 minutes for each child command. The previous
30-minute mutation deadline expired during a full run on a contended host.
Extending the deadline keeps missing outcomes fatal while allowing the complete
run to finish. Hosted full-analysis jobs have a separate two-hour cap.

The event recorder clears its event directory at the start of each run. The
checker requires exactly one pre-execution plan and one final event. It checks
source bytes, file inventory, unique mutant IDs, operators, replacement text and
locations. Event locations are zero-based; final report locations are one-based.
Missing, corrupt, duplicate and empty reports fail. A missing report cannot be
replaced with the previous headline score. Stryker dry-run mode does not emit a
new final report and is not used as evidence of a completed mutation run.

The checker is included in both coverage and mutation scope. Its tests include
actual temporary event files and malformed-result probes. Generated checker
JavaScript lives in `.quality-build/`; regenerate it with
`npx tsc -p tsconfig.quality.json`. It is not part of the npm distribution.

These checks establish result integrity for the invoked run. Repository policy
must also protect mutation scope, operators, tests, config and checker changes;
that separate hosted enforcement is not implied by a local passing result.

## Dependency repair

Stryker 10.0.0 depends on `typed-rest-client` 2.3.1, which pins `qs` 6.15.1. The
scoped package override selects patched `qs` 6.16.0. This repairs the vulnerable
dependency rather than suppressing audit results. Revisit the override when
upstream removes the vulnerable pin; verify mutation and audit again before
removing it.
