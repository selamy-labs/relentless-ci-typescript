# Runtime support

This template declares Node.js 22, 24 and 26. The
[upstream release schedule](https://github.com/nodejs/Release#release-schedule)
was checked on 2026-09-29 against schedule commit
`143dd650cab051b6d66176905da3d9f5f4236b55`.
All three release lines had started and had not reached end of life.

`npm run runtime:check` validates `quality/runtime-support.json` against the
current UTC date. Release support includes its start date and excludes its end
date. The current snapshot requires another upstream review before 2026-12-28;
an expired or future review fails. The check also requires the exact declared
Node engines and both workflow matrices to match the reviewed release inventory.
Missing files, duplicate declarations, malformed dates and unpinned source links
fail. The complete local verifier and installed-behavior jobs call this check.

The snapshot is checked locally without accounts or live network access. Its
recorded upstream URL identifies an immutable commit. Maintainers must verify the
upstream data when renewing the review or changing dates; the local schema alone
does not prove an edited date came from upstream. Protected policy review and
the App-owned issuer check guard changes to this snapshot.

| Node.js | End of life | Full analysis | Installed behavior    |
| ------- | ----------- | ------------- | --------------------- |
| 22      | 2027-04-30  | Linux         | Linux, macOS, Windows |
| 24      | 2028-04-30  | Linux         | Linux, macOS, Windows |
| 26      | 2029-04-30  | Linux         | Linux, macOS, Windows |

The checked-in workflow requests full analysis, coverage and every mutation for
each declared release line. Its compatibility matrix installs locked packages,
builds the product, tests behavior and exercises an isolated installed consumer
on every listed operating system. A requested job is not evidence that it passed.
Every matrix result must succeed; missing, skipped and cancelled jobs cannot
establish support.

The hosted workflow runs the full verifier independently on Node 22, 24 and 26.
Each full job retains raw coverage and mutation artifacts; installed behavior
runs on all three operating systems for every declared Node line. Publication
evidence binds those native jobs and artifacts to the exact source revision.

Recheck the upstream schedule before each publication and runtime-policy change.
Treat a release line as unsupported on or after its listed end date. Before that
date, update the declared engines, workflow matrices and documentation through a
reviewed change and run the complete replacement matrix. An upstream schedule
change requires the same review. Do not silently omit a failing runtime or
operating system, or treat this dated check as proof of future support.

See [dependency maintenance](maintenance.md) and
[workflow validation](workflows.md) for the associated checks and limitations.
