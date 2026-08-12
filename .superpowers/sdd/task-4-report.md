# Task 4 Report: DraftLab factor lists, known counts, remove excludeAdp

**Status:** Complete  
**Branch:** `feature/ol-proxy-shared-factors`

## Changes

- Added OL proxy labels and Task 3 half-PPR means to `benchmarks.ts`.
- Removed QB ceiling `adp`, added categorical `injury_concern`, and added WR/TE neutral pace plus TE OL pass-block factors.
- Set known-factor ceilings to QB 11, RB 16, TE 12, and WR 17; removed `CeilingOptions.excludeAdp`.
- Updated QB seed and spot-check factor rows, and added the ITEM-006 regression test.

## TDD and verification

- RED: `npx vitest run packages/evaluation-engine/src/__tests__/ol-proxy-shared-factors.test.ts` failed 5/5 as expected before implementation.
- GREEN: the same regression test passed 5/5 after implementation.
- `npx vitest run packages/evaluation-engine` passed: 9 files, 69 tests.
- Updated two legacy WR range tests from 15 to 17 known factors after the full suite exposed their stale expectations.

## Concerns

- No remaining implementation concerns. Unrelated `package-lock.json`, Wrangler cache, and untracked evaluation-engine scripts were intentionally not staged.
