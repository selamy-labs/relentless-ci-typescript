# Installed public package compatibility

The required `npm run package:check` includes both archive-content validation
and an isolated installed consumer. It installs the freshly validated local
archive with
`--offline --ignore-scripts --no-audit --no-fund --no-package-lock`; no registry
account or publishing step is involved. The consumer directory has its own
private ESM manifest and is removed after success or failure.

The initial template intentionally has one ESM public export and one CLI. Its
protected metadata contract declares `./dist/index.js`, `./dist/index.d.ts` and
the `relentless-example` executable targeting `dist/main.js`. Incorrect or
missing declarations fail. Native CLI registration must exist before execution;
npm exec selects the installed command with `--offline --no` to forbid
installation prompts or network fallback.

The public import runs in a separate Node process from the consumer directory,
so checkout source and project dev dependencies cannot satisfy the import. The
input `[[3,5],[0,2],[2,4],[8,10]]` must yield `[[0,5],[8,10]]`. The installed
CLI must produce the same compact JSON plus newline, no stderr and exit zero.
Invalid JSON and endpoints outside the declared bounds must produce the specific
documented errors, no stdout and exit two.

A generated `.mts` consumer imports the package by its public name. The locked
TypeScript compiler checks it with strict typing, NodeNext resolution, no emit
and no ambient type packages. Its expected result is an array of endpoint pairs.
Missing or incorrect shipped declarations fail independently of the working
JavaScript export. Native defective-archive probes exercise incorrect return
types, CLI targets, import targets and runtime results.

The process wrapper checks status, stdout, stderr, signals and launch errors.
Timeouts cannot count as success. All verification code remains enrolled in
complete coverage, full mutation, typing, static security and architecture.

For this fixed ESM export graph, native TypeScript consumption, exact public
metadata, file-byte validation and runtime consumption provide the required
compatibility evidence. Publint and Are the Types Wrong are candidate additional
analyzers for multiple subpaths, CommonJS, dual-module packages or more complex
conditional exports. Those capabilities are absent in the initial template;
adding them requires expanding the protected consumer profile and evaluating
those tools. This release makes no CommonJS promise.

Local Node 26 verification passes. The declared Node 22/24/26 hosted matrices,
copy/rename tests and final repository enforcement remain pending.

Native execution semantics:
[npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/).
