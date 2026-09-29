# Portable repository paths and text

The required hygiene gate combines native Git index names with a filesystem
walk. It reads ignored authored files as well as untracked files. Only declared
top-level generated roots are omitted; nested directories with those names stay
in scope. Source enrollment separately rejects committed files inside generated
exemptions and unsupported executable source. Missing Git, malformed native path
output, missing indexed files and unsupported symlinks fail. The Git inventory
command has a 30-second deadline.

Every file and directory component is checked for Windows-invalid characters,
control characters, empty components, trailing dots/whitespace and reserved
device names, including extension forms and the documented superscript digits.
The restrictions follow
[Microsoft's filename guidance](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).
The template additionally rejects Unicode-normalized uppercase collisions for
files and shared directories. This is a conservative portability policy rather
than an exact model of every filesystem's Unicode comparison rules.

The initial product and documentation are text-only. The protected file-kind
inventory permits TypeScript, executable MJS, JSON, Markdown, TOML, locks, YAML,
TXT and ignore-policy text, plus LICENSE, CODEOWNERS, .gitignore and .npmrc.
Adding binary assets, native extensions or another programming language needs
explicit scope and analyzer enrollment before the gate accepts them. This avoids
silently admitting new artifact classes that the initial template cannot check.

Every enrolled file must decode as UTF-8 without NUL bytes. Standard Git
conflict marker lines, including ancestor markers and larger marker widths,
fail. This does not replace syntax, schema, documentation, dependency or secret
checks; those remain separate required families.

Use the canonical spelling for shared directories, resolve conflicts and keep
generated artifacts in their declared output roots. Stage intentional removals
from the Git index before verification. Native Git/filesystem pass/fail probes
and parser boundary tests exercise the required gate without broad exclusions.
The hosted platform matrix and Python equivalent remain pending in this draft.
