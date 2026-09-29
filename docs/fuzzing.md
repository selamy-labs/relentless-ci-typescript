# Bounded parser fuzzing

The required test suite generates malformed JSON and invalid endpoint values
through fast-check. Malformed inputs use unclosed strings, arrays and objects,
and trailing array commas. Invalid endpoints include booleans, null, bounded
strings and exact half-integers. Expected rejections come from those independent
input grammars rather than another invocation of the parser.

Each family runs 200 cases through the public parser and 32 through the built
JSON executable. Inputs are bounded to 512 UTF-8 bytes. Every executable case
must finish within the same 10-second consumer deadline and produce exactly
exit 2, empty stdout and the expected stderr, with no signal or process error.
The complete suite still uses zero retries and its ordinary test deadline.

The checked-in seed is 20260929. A fast-check failure reports the seed and
shrinking path for reproduction. Shrinking remains enabled. These cases run
inside the same full test, coverage and mutation command as the other required
behavior tests. They do not replace model-based interval properties or deliberate
numeric-boundary cases.

Coverage-guided fuzzing is not enrolled: the current parser and validation
branches already have complete coverage and full mutation witnesses. Reassess
it if a replacement product introduces additional parser or binary surfaces.
Native platform and runtime results must be recorded separately; a Linux run
does not establish the entire hosted compatibility matrix.
