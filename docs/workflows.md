# Workflow validation and execution

The required `npm run workflows` gate independently enumerates the workflow
directory. It requires at least one regular `.yml` or `.yaml` file and rejects
symlinks, subdirectories and other extensions. Explicit absolute paths are
passed to the analyzers, including files ignored by Git.

Mise pins Actionlint 1.7.12, ShellCheck 0.11.0 and Zizmor 1.30.1 with platform
artifact hashes. The gate requires the exact ShellCheck version receipt before
Actionlint validates workflow syntax, expressions and embedded shell scripts.
Zizmor uses its pedantic persona, strict collection and ignore bypass. Native
errors, timeouts, invalid UTF-8, malformed reports and any finding fail. Each
child command has a 30-second deadline. The current native JSON receipt is saved
in `.quality-results/workflows-security.json`.

Zizmor runs offline, so this gate performs its local security audits without
GitHub credentials. It does not claim API-dependent remote action vulnerability
checks. See [Actionlint](https://github.com/rhysd/actionlint),
[ShellCheck](https://www.shellcheck.net) and
[Zizmor's usage reference](https://docs.zizmor.sh/usage/).

Knip declares only `mise` as an external binary prerequisite through
`ignoreBinaries`: it is installed outside npm and is not an undeclared npm
package. Its CI installer is pinned by version and digest. No verifier source
file or npm dependency is excluded by this declaration.

The checked-in workflow runs the full local verifier on Linux for Node 22, 24
and 26. The Linux command builds a verifier image from a digest-pinned Mise
base and exact `libatomic1` and `procps` package versions, then launches it
with a private PID namespace. The host command retains only the
checked-out workspace and dedicated tool cache mounts and confirms named
container removal on completion. A final container guard rejects any live
descendant, including one that detached from a direct child. A restricted
Docker boundary probe passed on standard hosted Ubuntu 24.04, but the complete
containerized verifier and mutation matrix remain to be qualified.
All three runtimes build and test product behavior and an isolated
installed package on Linux, macOS and Windows. Standard hosted runners use
read-only permissions, no persisted checkout credentials and pinned action
commits. Installer caches are disabled. Candidate-specific concurrency groups
keep duplicate runs from overlapping without cancelling other revisions.

The aggregate job requires both matrix results to be successful. Missing,
failed, skipped and cancelled results cannot satisfy its shell check. Raw
analysis receipts are retained for seven days. Daily runs repeat the same checks
against main to detect newly disclosed dependency vulnerabilities.

Native local probes establish scanner behavior and aggregate-state rejection.
The published `main` revision `3b43532` passed its first hosted run across all
three full Node analyses and nine installed-behavior jobs. The protected branch
strictly requires the aggregate `Relentless CI gate` from the GitHub Actions
App. This is interim enforcement: a dedicated trusted-policy check, source-bound
maintainer rationale, and live bypass probes remain outstanding. The
`CODEOWNERS` file assigns the whole repository, including `.github`, to the two
current administrators. Code-owner review is not enforced until the file is on
protected `main` and that branch's review setting is enabled and read back.
