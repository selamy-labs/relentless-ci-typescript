# Relentless CI — TypeScript

A framework-neutral starting point for a small typed library and JSON CLI, with
strict quality checks that also test their executable verifiers.

The checked-in gates run locally and in the declared GitHub Actions matrix.
Each generated repository must separately configure protected-branch checks,
code-owner review and a trusted policy issuer before treating those results as
enforced. See individual gate documents for precise scope and limitations.

## Run the full local verifier

Prerequisites: Node.js 22, 24 or 26, npm and Git. Linux full verification
also requires a running Docker daemon; macOS and Windows currently use the
host-installed [Mise](https://mise.jdx.dev/) toolchain.
Run from the repository root:

```sh
npm run verify
```

The full command installs locked development tools, runs the checked-in gate
definitions, scans secrets/dependencies/source security, and runs full mutation
testing. Tool downloads and vulnerability queries need network access; code
checks require no accounts or credentials. Mise pins native scanner versions and
platform artifact hashes. A missing tool, failed command, malformed report or
incomplete inventory fails verification. On Linux, a container built from a
digest-pinned Mise image and exact `libatomic1` and `procps` package versions
supplies Mise, the declared Node patch version and Stryker's process inspector.
The build hashes the checked-in `quality/verifier.Dockerfile` into the local
image identity, so a changed image policy cannot reuse a stale build. The
container keeps the verifier and its descendants in a private PID namespace,
checks for live processes
between major stages, and removes the named container with an absence readback
even after a failed gate. The container runs as the invoking user with a
read-only root filesystem and dropped capabilities. The launcher passes no host
credential environment variables and mounts no Docker socket or host credential
directory. The checkout and a dedicated Mise tool cache are its writable mounts.
The private `/tmp` filesystem permits executable installed-package probes.
The complete product verifier in this container still needs full local mutation
and hosted matrix qualification; the boundary has only passed focused probes.

The configured local tools include strict TypeScript, ESLint/SonarJS, Prettier,
Knip, Vitest/fast-check, dependency-cruiser and Stryker. Strict policy values
are 399 physical lines per authored file, cognitive complexity 5, cyclomatic
complexity 10, and 100% line and branch coverage. Mutation must conclusively
kill every planned valid mutant. No equivalent-mutant exceptions are in use.

## Example behavior

The example normalizes bounded integer half-open intervals `[start, end)`.
Endpoints range from -1,000,000 through 1,000,000 and `start < end`. It sorts
and merges overlapping or adjacent intervals without changing its input.

```sh
npm run build
printf '[[5,8],[1,3],[2,6]]' | node dist/main.js
```

Output is `[[1,8]]` followed by a newline. Valid input exits 0; malformed input
writes a useful error to stderr and exits 2. Boolean, fractional and nonfinite
endpoints are invalid. Integral JSON numeric values are accepted.

Product code is in `src`. Tests include behavior/boundary examples, CLI streams
and exit statuses, idempotence and permutation properties, and an independent
bounded set-union model. Keep the verifier tests when replacing the example
library with your own application.

## Understand a failure

- [Source enrollment and physical lines](docs/source-scope.md)
- [Mutation outcomes and completeness](docs/mutation.md)
- [Secret, vulnerability and static security scans](docs/security.md)
- [Dependency and architecture boundaries](docs/architecture.md)
- [Type and lint suppression policy](docs/lint-policy.md)
- [Portable repository paths and text](docs/repository-hygiene.md)
- [Workflow validation and runtime matrices](docs/workflows.md)
- [Support-file format and duplicate-key validation](docs/support-files.md)
- [Documentation structure, spelling and local links](docs/documentation.md)
- [Dependency update proposals and runtime maintenance](docs/maintenance.md)
- [Declared runtimes and dated upstream support](docs/runtimes.md)
- [Policy inspirations and chosen thresholds](docs/policy-provenance.md)

Fix the underlying defect and rerun the full command. Do not shrink source
scope, lower thresholds, add broad suppressions, ignore unsuccessful mutants or
substitute a faster profile for required verification. Changes to policy need
explicit rationale and approval from trusted maintainer/platform state; that
hosted enforcement is not yet installed in this draft.

## Adapt the starting point

Replace the example in small steps, update package names and entry points, and
regenerate the dependency lock using the native package manager. Keep authored
code inside enrolled locations. New extensions, generated paths and analyzer
limitations must be enrolled explicitly before verification can accept them.

MIT licensed; see [LICENSE](LICENSE).

See [duplication gate semantics and remediation](docs/duplication.md).

See [bounded parser fuzzing](docs/fuzzing.md).
