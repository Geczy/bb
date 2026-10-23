# Full-workflow CI prototype

The three-minute target remains unproven. These experiments keep all 45 manual-run jobs, existing shards, and test assertions. Nothing from these prototype branches has been merged.

## Method

All variants use application/test source from `7999d3df2096ddfc382eda91fb4b8bfaffe8cead`, including the unmerged DB/CLI batch in PR #6142. Only `.github/workflows/ci.yml` changes. Both baseline and candidates set `TURBO_FORCE=true`; observed logs confirm task-cache bypass. Dependency and compiler caches retain normal behavior. This is a forced-task workload, not a forecast of normally cached CI. Force also prevents reuse between sequential Turbo invocations inside a job.

Runs execute sequentially. An initial candidate dispatch was canceled early to avoid competing with baseline and is excluded. Each configuration has only one completed sample, so the comparison is exploratory rather than a reliable performance estimate.

## Results

| Variant | Workflow creation to last completion | Result |
| --- | --- | --- |
| [Baseline](https://github.com/get-bb/bb/actions/runs/39876743715) | 5m28s | 45 jobs passed |
| [8-vCPU Linux/Windows; four test workers](https://github.com/get-bb/bb/actions/runs/39877328192) | 5m27s | 44 passed, one failed |
| [8-vCPU; two workers for multi-package Linux jobs](https://github.com/get-bb/bb/actions/runs/39877897657) | 4m50s | 42 passed, three failed |

Failed jobs can abort remaining work. Neither candidate duration is a valid time-to-green improvement.

macOS runners, Turbo task concurrency, and shard counts are unchanged. Candidate Linux and Windows runners request twice the CPUs; billable cost was not measured. Larger runners should not be adopted fleet-wide on this evidence.

## What improved inside the first candidate

| Step | Baseline | First candidate |
| --- | ---: | ---: |
| Linux server shard 1 tests | 123s | 72s |
| Windows server shard 1 tests | 124s | 74s |
| Windows miscellaneous package tests | 163s | 92s |
| Windows app shard 2 tests | 150s | 113s |

These are individual step durations, not additive workflow savings. Windows app shard 2 started 57s into baseline and 81s into the first candidate. Its checkout increased from 7s to 41s and install from 35s to 52s, outweighing faster tests. Windows app tarball smoke also increased from 73s to 111s. Linux package-smoke job duration decreased from 205s to 178s, still leaving little room for planning and queueing within three minutes.

## Failures

Both candidates crashed a Vitest worker running `packages/process-utils/test/performance-diagnostics.test.ts`. Reducing the multi-package job back to two workers did not resolve it, so simple worker oversubscription is not an established root cause.

The bounded candidate also failed:

- Linux plugin FRP end-to-end setup: GitHub archive download timed out after 10s.
- Windows AI gateway D1 reservation test: expected five successful reservations, observed zero.

The baseline passed these checks. The experiments do not establish whether every failure is caused by runner changes or underlying flakiness; none should be ignored to claim a green result.

## What reaching three minutes would require

A working target budget is approximately 30s planning/provisioning, 30s checkout/dependency setup, and 120s execution/cleanup for every required lane. It is a design target, not a demonstrated result.

1. Prototype reusable installed-dependency snapshots for Windows, keyed by exact dependency/toolchain inputs and followed by frozen-install validation. Count archive restore/save overhead and test both cache hits and misses; prior store-cache extraction was expensive.
2. Reduce provisioning delay and checkout variability. Additional shards would duplicate this overhead, so evaluate fleet capacity before increasing them.
3. Profile packaging separately, using normal intra-job build-cache reuse. Test sharing build artifacts or separating independent packaging checks only after identifying actual repeated or serialized work.
4. Retain larger runners only for lanes with repeatable gains and stable tests. Resolve the diagnostics worker crash before enabling the failing Linux configuration.

A successful follow-up needs repeated complete green runs with identical coverage, plus end-to-end durations and compute cost. Individual test-step gains are insufficient.
