# P0 Gap Closure + P1 Job Staging — Implementation Plan

> Branch: `siddharth/Picking-list`
> Started: 2026-05-07
> Strategy: Smallest-blast-radius first, commit at each checkpoint, no unbounded mutations until P0 gaps are closed.

## Build Order

### P0 Gap Closure
- [x] **1. Multi-shelf allocation + 3-level destination resolution in RPC** — `20260507000000`.
- [x] **2. Auto-gen PL trigger** on `job.status → Planned/Released` — `20260507000001`.
- [x] **3. Soft over-pick warning tier** — `20260507000002` + service/UI updates.
- [x] **4. `$jobId.picking-lists.tsx`** job tab + JobHeader plumbing.
- [x] **5. MES routes** — `picking-lists`, `picking-list.$id`, `picking-list.$id.scan.$lineId`, `picking-list.$id.confirm`, `picking-list.$id.pick` + sidebar nav.

### P1 — Job Staging
- [x] **6. Schema** — `20260507000003` adds finishTo cols + propagation trigger.
- [x] **7. `get_job_staging_assessment` RPC** — `20260507000004`.
- [x] **8. Edge fn ops** — `stageJob` and `generateStockTransfer` in `pick/index.ts`.
- [x] **9. `$jobId.staging.tsx`** route + UI + JobHeader plumbing.

## Out of scope (still deferred)
- Picking Waves (explicitly archived in rough notes)
- FEFO/expiry-aware proposal
- Refactor `pick/index.ts` ↔ `issue/index.ts` shared consumption helper

## Checkpoints
After each numbered item: type-check passes, commit with `feat(picking-list):` prefix, update this file's checkbox.
