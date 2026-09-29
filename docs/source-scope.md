# Authored source enrollment

`npm run scope` discovers source independently of Git ignore rules. All authored TypeScript must live in `src`, `tests`, or `quality`. The two existing executable root configurations, `vitest.config.ts` and `eslint.config.mjs`, are explicitly enrolled. Other JavaScript/TypeScript extensions and new root configurations fail until their typing, lint, coverage and mutation scope is enrolled through reviewed policy changes.

Every enrolled file has at most 399 physical lines, including comments and blank lines. LF, CRLF and CR line endings are supported; an optional terminal newline does not add a fictitious extra line. Symlinks fail. Code under nested generated-directory names fails because downstream analyzers may skip those paths. Generated-directory exemptions apply only at the repository root, and tracked content in those exemptions fails even when forced past `.gitignore`.

Protected top-level generated areas are `.git` (Git metadata), `.venv` (an optional local environment), `.codegraph` (local indexing), `.pytest_cache` and `.hypothesis` (optional local Python tooling), `node_modules` (`npm ci`), `dist` (`npm run build`), `coverage` (`npm run coverage`), `.quality-results` (`npm run mutation` and gate reports), `.quality-build` (`tsc -p tsconfig.quality.json`), and `.stryker-tmp` (`npm run mutation`). None may contain tracked inputs. These entries authorize local generated state, not exceptions for maintained source. Hosted jobs must recreate environments and artifacts from protected inputs; the complete hosted freshness checks are still being implemented.

This gate is part of the shared full local verifier. Hosted enforcement, policy-change approvals and generated-artifact freshness still remain pending.

Executable root tool adapters (`vitest.config.ts` and `eslint.config.mjs`)
are enrolled in V8 coverage and Stryker mutation as well as size, typing, lint,
security and dependency analysis. Their policy values live in protected JSON
files under `quality`; those files are data, not executable source. Native
configuration tests prove strict typing/semantic rules and the 399/400 line,
5/6 cognitive and 10/11 cyclomatic boundaries. The cyclomatic probe disables
cognitive reporting only in its isolated ESLint instance so that the stricter
cognitive limit does not mask the cyclomatic boundary; the required repository
configuration enforces both.
