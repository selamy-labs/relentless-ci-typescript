# Dependency and architecture gates

`npm run architecture` invokes locked dependency-cruiser 18.4.0. The same
command is in the full local verifier's protected check registry. It scans
all files under `src`, `tests` and `quality`, plus both executable root
configurations and the two bootstrap modules. It does not start from a single entry point, so an unimported
nested module is still analyzed.

All dependency cycles, unresolved imports and packages absent from the
manifest are errors. Production modules also cannot import tests, verifier
code, executable tool configurations or development dependencies. Type-only
TypeScript imports are included. Tests and verifier modules may import
explicitly declared development dependencies.

The policy is declarative JSON, with Node import/export resolution and
TypeScript configuration. Dependencies in `node_modules` are recorded for
classification but their implementation is not recursively analyzed as
owned code. Locked package vulnerability scans cover that inventory
separately. Source rules have no exceptions or ignored edges. Native caches
and automatic known-violation baseline suppression are explicitly disabled.

`tests/architecture.test.ts` runs the real CLI on isolated temporary projects.
It proves clean declared dependencies, development imports in tooling,
undeclared imports from all three source roots, type-only development imports,
production-to-test/verifier edges, unresolved imports and never-imported
nested cycles. It checks the intended rule diagnostic as well as failure,
and rejects missing or malformed configuration. A matching known-violation
baseline cannot suppress an undeclared production dependency.

The error reporter is intentional: dependency-cruiser's JSON reporter can
exit successfully while returning rule violations. A successful JSON command
alone is not evidence that a graph satisfies the policy.

Remediation is to remove a forbidden edge, separate a production abstraction
from tooling, declare a real runtime dependency in `dependencies`, or repair
the import path. Do not silence a violation by adding a baseline, reducing
severity, narrowing scope or moving a development package into production
without a genuine runtime need. Policy changes still need trusted approval;
hosted policy enforcement and the runtime matrix are not yet implemented.

References: [rule semantics](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
and [CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md).
