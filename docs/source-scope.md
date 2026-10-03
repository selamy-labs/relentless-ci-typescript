# Authored source enrollment

`npm run scope` discovers source independently of Git ignore rules. All authored
TypeScript must live in `src`, `tests`, or `quality`. The executable root
adapters `eslint.config.mjs`, `dependency-policy.mjs` and `dependency-main.mjs`
are explicitly enrolled. Other JavaScript/TypeScript extensions and new root
configurations fail until their typing, lint, coverage and mutation scope is
enrolled through reviewed policy changes.

Every enrolled file has at most 399 physical lines, including comments and blank
lines. LF, CRLF and CR line endings are supported; an optional terminal newline
does not add a fictitious extra line. Symlinks fail. Code under nested
generated-directory names fails because downstream analyzers may skip those
paths. Generated-directory exemptions apply only at the repository root, and
tracked content in those exemptions fails even when forced past `.gitignore`.

Protected top-level generated areas are `.git` (Git metadata), `.venv` (an
optional local environment), `.codegraph` (local indexing), `.pytest_cache` and
`.hypothesis` (optional local Python tooling), `node_modules` (`npm ci`), `dist`
(`npm run build`), `coverage` (`npm run coverage`), `.quality-results`
(`npm run mutation` and gate reports), `.quality-build`
(`tsc -p tsconfig.quality.json`), and `.stryker-tmp` (`npm run mutation`). None
may contain tracked inputs. These entries authorize local generated state, not
exceptions for maintained source. Hosted jobs recreate environments and
artifacts from protected inputs. The verifier removes stale reports before
checking fresh native coverage, test, security and mutation results.

This gate is part of the shared full local verifier and every hosted analysis
job. Protected policy changes require the separate App-owned issuer check.

Executable tool adapters, including `quality/vitest-config.ts`, are
enrolled in V8 coverage and Stryker mutation as well as size, typing, lint,
security and dependency analysis. Their policy values live in protected JSON
files under `quality`; those files are data, not executable source. Native
configuration tests prove strict typing/semantic rules and the 399/400 line, 5/6
cognitive and 10/11 cyclomatic boundaries. The cyclomatic probe disables
cognitive reporting only in its isolated ESLint instance so that the stricter
cognitive limit does not mask the cyclomatic boundary; the required repository
configuration enforces both.

Vitest 5.0.2 forcibly excludes conventional configuration filenames from V8
coverage, even when explicitly included. The authored Vitest adapter therefore
lives in `quality/vitest-config.ts`. Test and coverage commands compile it using
`tsc -p tsconfig.quality.json` and load the fresh generated JavaScript copy.
Tests import the authored adapter directly. Stryker loads the authored adapter
from its explicit configuration; its mutation scope still includes all quality
source. This relocation adds no authored coverage or mutation exemption.

The full verifier removes stale coverage before running its check registry.
After coverage, it requires a native `coverage-final.json` entry for every
discovered non-test executable source, including configuration adapters and
never-imported modules. Unexpected or missing paths, mismatched map/counter
identities, invalid source positions, uncovered statements/functions/branches
and incomplete branch-arm counts fail. Native line and branch thresholds remain
100%; a percentage report alone cannot prove source enrollment.
Native implicit `else` arms use empty start/end positions; only that exact
position shape is accepted for branch arms. Their positive counters and exact
arm counts remain mandatory. Statement and function positions stay validated.
