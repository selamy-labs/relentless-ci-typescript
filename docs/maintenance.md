# Dependency maintenance

The checked-in Dependabot configuration proposes npm and GitHub Actions updates
every Monday in UTC. Each ecosystem permits up to five open update pull requests.
Updates use public registries and require no repository secrets.

Every update pull request must run the same complete verifier, including full
mutation, vulnerability scanning and dependency policy checks. An update cannot
approve its own license, install script, analyzer suppression or policy change.
Maintainers must review those changes through the trusted repository protections.
Dependency age alone is advisory; every known vulnerability still fails the scan.

GitHub Actions remain pinned to commit hashes with release comments. Dependabot
can propose changes to these references. Native tools pinned in Mise require
separate release and checksum review; Dependabot does not maintain those pins.

The declared Node versions are 22, 24 and 26. Before changing the runtime matrix,
verify the upstream support schedule and run the complete Linux verifier for
every declared version, plus installed behavior on Linux, macOS and Windows.
Adding an updater does not establish that a runtime is still supported.

This configuration is a local draft. GitHub parsing and actual update jobs remain
unverified until publication. Live repository settings must also enable the
intended dependency alerts and security updates. Their coverage does not replace
the complete local vulnerability inventory.

Sources: [Dependabot configuration](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
[supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
and [Node release schedule](https://github.com/nodejs/Release#release-schedule).
