# Dependency policy before installation

`npm run verify` first runs `node dependency-main.mjs`, then installs the frozen
lock with dependency scripts disabled. The bootstrap uses Node's standard
library and works without `node_modules`. The same check runs again in the full
verifier's protected registry. It validates the entire npm lock, including
optional packages not installed on the current platform.

Every dependency must have nonempty version and license metadata, a tarball URL
from the approved public registry, and a canonical SHA-512 integrity value.
Credentials, queries, fragments, non-tarball paths, foreign origins and
non-registry links fail. Manifest name, version, license and all three direct
dependency classes must match the locked root package. Empty or malformed
inventories fail. A root `npm-shrinkwrap.json` is rejected because npm would use
it instead of the audited lockfile. npm's frozen installation separately
enforces manifest consistency and verifies downloaded artifact integrity.

`quality/dependency-policy.json` records the approved metadata expressions.
Runtime dependencies initially allow `0BSD`, `Apache-2.0`, `BSD-2-Clause`,
`BSD-3-Clause`, `BlueOak-1.0.0`, `ISC` and `MIT`. Development tools additionally
allow `CC-BY-4.0`, `LGPL-3.0-only` and `MPL-2.0`, covering the current data and
analyzer tools. The template's own license must remain `MIT` unless the policy
is reviewed and changed together with it.

These are explicit metadata approvals, not a conclusion about compatibility or
permission to omit notices. Unknown, missing or newly introduced license
expressions fail and require review. Composite SPDX expressions are accepted
only if their complete expression is explicitly approved; the gate does not
guess at legacy license names or license files. Keep required dependency notices
when redistributing third-party material.

The only current install-script declaration is `fsevents@2.3.3`. Its exact
version and artifact hash are recorded in the policy. Changed or new script
declarations fail. This review does not execute the script: `.npmrc` and the
full installation command disable dependency scripts. Source changes to the
policy, registry configuration or bootstrap need the same trusted approval as
other quality policy. The App-owned issuer checks protected policy changes.

On success, the bootstrap replaces `.quality-results/component-inventory.json`
with every locked package path, version, declared license, URL, hash and
development classification. It deletes the old receipt before validation, so
failures cannot leave an apparently current successful inventory.

Tests cover malformed fields, blocked licenses and URLs, digest length and
encoding, install-script changes, manifest drift, nested package versions and
empty inventories. Native CLI probes run copied bootstrap files in temporary
projects with no installed packages. Hosted full-analysis artifacts retain the
component inventory alongside the raw security and mutation reports. The
independent Python template uses its own lock and license policy.

Sources:
[npm lock format](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/),
[frozen installation](https://docs.npmjs.com/cli/v11/commands/npm-ci/),
[SPDX identifiers](https://spdx.org/licenses/), and
[SPDX expressions](https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/).
