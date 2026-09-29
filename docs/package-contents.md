# Public package contents

`npm run package:check` is a required step in the full verification registry. It
creates a fresh temporary directory containing only the public manifest, README,
license and newly compiled product modules. Compilation uses the project build
configuration with a new output directory, so stale files in the checkout's
`dist` cannot enter the archive. Native `npm pack --ignore-scripts --json` then
packs this public stage without running lifecycle scripts.

The checker independently reads the actual compressed archive with node-tar's
strict stream reader. It never extracts archive members. Only regular files are
permitted; duplicate paths and unexpected or missing files fail. Each member's
bytes must equal the corresponding fresh public build. The protected
`quality/package-policy.json` lists all thirteen permitted files, including
declarations, the license, README and manifest.

The native pack report must agree with actual compressed size, file inventory,
file modes, byte sizes, unpacked size, manifest identity, SHA-1 and SHA-512.
Native npm releases emit either a single-element array or an object keyed by
package name. Both shapes must contain exactly one complete package report.
A keyed report must bind its key to the validated manifest name; extra packages
and every existing archive or metadata inconsistency still fail.
Malformed JSON or UTF-8, unsafe archive filenames and inconsistent metadata
fail. Reports and archives are saved only after content validation succeeds. The
complete bounded archive is supplied to the reader at once. Native TAR parsing
checks truncation and declared member lengths; independently compared member
bytes establish content identity. The owned temporary directory is removed after
success or failure.

The compressed budget is 64 KiB, file-content budget 256 KiB and bounded raw TAR
decompression budget 512 KiB. These are project choices for the small starting
library, not claims of universal industry thresholds. Current native artifacts
are approximately 5 KiB compressed and 10 KiB of file contents. Public archive
files use mode 0644; npm installs the declared CLI executable. Changes to paths
or budgets require protected-policy review.

Native probes exercise valid contents, extra/missing/changed files, duplicate
archive/report paths, substituted paths, directory records, truncated TAR,
invalid gzip, dishonest sizes/modes/digests and exact budget boundaries.
Verification code itself remains enrolled in strict typing, ESLint complexity
limits, complete coverage, SAST, architecture and full mutation.

Full local verification for this slice passes with complete coverage and all 903
mutants killed. The required automated consumer gate installs this same
validated archive offline without scripts in a second fresh temporary project.
It validates public import/type metadata and native CLI registration, imports
through the public export map, invokes the registered CLI using npm exec and
compiles a strictly typed consumer against the shipped declarations. Status,
stdout and stderr must match each probe exactly; timeouts and tool errors fail.
The npm wrapper uses error-level logging to exclude its informational run
notices from the product stream contract. Product stderr remains fully captured
and must match; npm failures still produce a failing status.
Receipts are saved only after all consumer checks pass. Native archives with
broken declarations, CLI metadata, import metadata or runtime behavior fail.
Copy/rename tests, reproducibility and hosted matrices remain pending. No
registry publishing is part of this template.

Native semantics: [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/)
and [node-tar](https://github.com/isaacs/node-tar).
