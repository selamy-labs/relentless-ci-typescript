# Documentation checks

The required `npm run documentation` gate independently discovers authored
Markdown, including hidden files and files ignored by Git. Protected generated
root directories follow the source-scope policy. Empty discovery, empty
Markdown and invalid UTF-8 fail. A failed run removes its previous success
receipt rather than leaving stale evidence. Every document is checked without reading
implicit per-directory Markdownlint configuration.

[Markdownlint](https://github.com/DavidAnson/markdownlint) 0.41.1 runs its default
structure, whitespace and link-reference rules. Inline configuration comments
cannot disable checks. Remediation fixes the document rather than adding a
suppression. Prose is wrapped to the default 80-column rule; the provenance
comparison uses concise bullets to keep long source URLs readable.

[mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)
with its native GFM extensions parses links, images, definitions and headings.
Fenced and inline code examples are not treated as active links.
[GitHub Slugger](https://github.com/Flet/github-slugger) derives heading IDs,
including Unicode and repeated-heading suffixes. Repository-local link targets
must be in the independently discovered authored-file inventory; directories,
missing files and generated/external filesystem targets fail. Heading fragments
are decoded and checked against the destination Markdown document. This profile
accepts heading fragments on Markdown and plain links to other authored files;
fragments on non-Markdown files are unsupported and fail explicitly.

[Typos](https://github.com/crate-ci/typos) 1.50.3 checks known misspellings in all
documents. It is not an unknown-word dictionary and does not claim to detect
every possible misspelling. Its isolated mode ignores ambient spelling
configuration. Hidden and ignored documents are explicitly enrolled. A separate
native JSON file inventory must equal the exact expected paths, including
multiplicity. Missing, malformed or finding-bearing receipts, invalid UTF-8,
tool failures and timeouts fail. Each native child has a 30-second deadline.
The Mise lock pins artifacts for Linux, macOS arm64/x64 and Windows.

HTTP, HTTPS and mail links are recorded in
`.quality-results/documentation.json`. The required local gate does not fetch
remote content. External availability diagnostics and installed README example
execution remain separate outstanding checks; collecting URLs is not proof of
remote availability or example correctness. Native local structure/link/spelling
probes do not prove hosted runtime matrices or repository protection.
