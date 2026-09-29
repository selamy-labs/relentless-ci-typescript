# Support-file validation

The required `npm run support:check` gate parses every authored JSON, YAML and
TOML file, including `mise.lock` as TOML. It uses the same filesystem discovery
as repository hygiene, independently of Git ignore rules. Root generated
directories are exempt under the documented source policy; nested authored files
are checked. An empty support-file inventory fails. The reader rejects invalid
UTF-8 instead of replacing corrupt bytes.

Pinned native parsers provide the format checks:

- [Microsoft's jsonc-parser](https://github.com/microsoft/node-jsonc-parser)
  3.3.1 validates strict JSON with comments and trailing commas forbidden. Every
  parser error fails. A visitor records the full parent path and property name
  to reject duplicate keys, including escaped equivalent spellings. Equal names
  in different objects or array elements remain valid.
- [YAML](https://eemeli.org/yaml/) 2.9.1 validates a single document with unique
  string mapping keys. Parser warnings and errors fail. Alias expansion is
  disabled, so aliases fail instead of hiding or multiplying settings. Empty
  documents fail.
- [smol-toml](https://github.com/squirrelchat/smol-toml) 1.9.0 validates TOML
  syntax and duplicate declarations. Empty TOML is valid: the OSV configuration
  deliberately has no vulnerability exceptions or severity filters.

These checks establish syntax and unambiguous keys. Individual tools still
validate the settings they consume: TypeScript, ESLint, Knip,
dependency-cruiser, Mise, Actionlint and Zizmor, plus the verifier's policy
schemas. A syntactically valid but unsupported setting must also pass its owning
tool; the generic parser gate does not claim a universal schema for every future
tool.

The parsers run locally without credentials or network access. Their exact
versions and integrity hashes are in the npm lock; the dependency policy checks
their licenses and origins before installation. Deliberate-defect tests include
malformed formats, duplicate keys, warnings, aliases, missing scope, ignored
nested files, symlinks and invalid UTF-8.
