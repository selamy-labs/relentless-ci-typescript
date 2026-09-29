# Duplication

`npm run duplication` uses the MIT-licensed native jscpd 5.3.3 release,
installed through the checked-in Mise lock. The lock records SHA-256 hashes
for Linux x64, macOS arm64/x64 and Windows x64 artifacts. Source and semantics:
[upstream release](https://github.com/kucherenko/jscpd/releases/tag/v5.3.3)
and [native documentation](https://github.com/kucherenko/jscpd/blob/v5.3.3/docs/rust.md).

The required final scan allows zero exact token duplication at a minimum of
50 tokens and 5 lines, using the upstream mild tokenization mode. It compares
all independently discovered authored TypeScript and executable JavaScript
configuration, including tests and verifier code. Generated directories use
the same protected inventory as the other source gates. Detection compares
files within the same format. It does not claim semantic equivalence or
cross-language clone detection.

Every enrolled file is copied byte-for-byte into a fresh temporary directory.
Fatal UTF-8 decoding rejects malformed inputs. Inline ignore directives are
rejected because native tokenization otherwise suppresses their contents.
An explicit empty configuration, explicit source paths, disabled Git ignore
filtering and a size limit above supported source sizes prevent ambient
configuration or file-size defaults from hiding source. No baseline or
identifier/literal normalization is enabled.

The native line setting counts `end.line - start.line`, while its clone
report counts both endpoint lines. A setting of 4 therefore enforces the
five-line policy; a setting of 5 would miss exact five-line clones. Boundary
probes confirm rejection at 50 tokens/five lines and acceptance below either
policy bound. The native final source inventory admits files with at least
50 tokens and four lines; file admission differs from clone eligibility.

Native reports omit files below their token or line minima. Each source
therefore gets an inventory scan at one token and one line, with a permissive
threshold used only to collect its source metadata. These receipts cannot
pass the duplication gate. Nonempty omissions, substituted paths or sizes,
malformed reports and tool failures fail. The final combined scan uses the
required 50-token/5-line minima and zero threshold. Its exact eligible file
and folder membership, per-file metadata, aggregate totals and zero finding
fields must agree with the inventory receipts. The authored snapshot must
also remain unchanged through completion.

Raw per-file and combined reports remain in `.quality-results/duplication`.
A fresh `verified.json` is written only after all checks pass; stale reports
are removed before discovery or tool execution. Hosted analysis retains these
receipts alongside its other reports. Local receipts establish only the
runtime/platform on which they were produced.

Extract repeated resource setup or receipt construction into a focused helper
when that expresses shared behavior. Preserve independent assertions and
meaningful defect fixtures. Do not automatically abstract unrelated tests or
silence findings through ignore markers, thresholds or scope changes. Native
jscpd does not supply an automatic extraction operation.
