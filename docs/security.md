# Security gates and the local verifier

With Git, Node/npm (a supported Node 22, 24 or 26 release) and Mise 2026.9.16 installed, run:

```sh
npm run verify
```

The command installs the frozen npm lock with dependency install scripts disabled, compiles the verifier, runs the protected check registry, runs pinned security tools, and executes full mutation with raw-result validation. npm's own CLI is invoked through the current Node executable, avoiding Windows shell-wrapper differences. All process failures and deadlines fail the verifier. The current required registry includes build, typing, lint, formatting, dead-code, architecture and coverage checks; packaging, hosted enforcement and other inventory gates remain pending.

`mise.toml` and `mise.lock` pin Gitleaks 8.30.1, OSV-Scanner 2.6.0 and Opengrep 1.30.0, with exact artifact URLs and hashes for Linux x64, macOS arm64/x64 and Windows x64. Only local macOS/Node 26 execution is currently verified. The hosted runtime/platform matrix remains pending. Code checks require no paid service or login. Scans of known vulnerabilities require public network access; native analyzer binaries are separately hash-pinned and are not part of the npm vulnerability inventory.

Scanner arguments live in `quality/security-commands.json`. This is protected policy data, alongside rules, tool versions, suppressions and check definitions. It must receive the same trusted maintainer review as a workflow change; the hosted approval mechanism is still being implemented. Moving arguments to JSON does not authorize weakening them.

Before scanning, all four `.quality-results` security reports are removed. New missing, malformed or invalid-UTF8 output fails. Gitleaks checks the working tree and all locally available Git history, redacts output, disables inline suppression comments, and uses an explicitly empty fingerprint-ignore file. Hosted checkouts must fetch complete history. Its config extends the default rule set and excludes only protected generated paths; source enrollment rejects tracked files hidden there and source in nested generated directories.

OSV scans all locked development, transitive and platform-specific packages without a severity floor or reachability filter. The validator independently derives every distinct name/version/ecosystem tuple from the npm lock, including nested installations and aliases. Repeated installations of an identical version are audited once; different versions remain distinct. The current 427 lock entries correspond to 388 distinct tuples. Omitted/substituted packages, duplicate audit records, findings, errors and incorrect lockfile provenance fail independently of the tool status.

Opengrep uses an explicit six-rule baseline, three applicable to JavaScript/TypeScript: dynamic evaluation, input-to-shell taint and disabled TLS verification. This is not an exhaustive security rule catalogue. Intrafile taint follows input through helper functions. Strict mode rejects warnings/errors/findings, inline suppressions are disabled, ignore files and size skipping are bypassed, and skipped rules fail. The reported scanned-file inventory must equal independently discovered sources, including the two enrolled root configurations. Its internal ignore-bypass option is pinned and must retain completeness tests when upgraded.

Product, executable verifier modules and root Vitest/ESLint adapters are enrolled in coverage and mutation. Policy values are protected declarative JSON; native configuration tests exercise the numeric boundaries. Full clean-clone, copy/rename and installed-artifact tests remain pending. These are delivery limitations, not exclusions approved for publication.

Primary references: [OSV report/exit semantics](https://github.com/google/osv-scanner/blob/main/docs/output.md), [Opengrep engine](https://github.com/opengrep/opengrep), [Mise locks](https://mise.jdx.dev/dev-tools/mise-lock.html), [Gitleaks usage](https://github.com/gitleaks/gitleaks).
