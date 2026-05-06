# P0 Gap Closure + P1 Job Staging — Implementation Plan

> Branch: `siddharth/Picking-list`
> Started: 2026-05-07
> Strategy: Smallest-blast-radius first, commit at each checkpoint, no unbounded mutations until P0 gaps are closed.

## Build Order

### P0 Gap Closure
- [ ] **1. Multi-shelf allocation + 3-level destination resolution in RPC** — single migration update; biggest correctness win.
  - Walk shelves by available qty DESC; one PL line per contributing shelf; last line carries shortage if still short.
  - Resolve `destinationStorageUnitId` via `COALESCE(workCenter.defaultStorageUnitId → pickingList.destinationStorageUnitId → NULL)` per line.
- [ ] **2. Auto-gen PL trigger** on `job.status → Planned/Released`. Idempotent via `pickingStatus = 'Not Generated'` guard.
- [ ] **3. Soft over-pick warning tier** with tolerance hierarchy on `companySettings`/`itemGroup`/`item`.
- [ ] **4. `$jobId.picking-lists.tsx`** job tab (read-only list of PLs for this job).
- [ ] **5. MES routes** — list, pick screen, scan modal, confirm. Mirror stock-transfer scan UX.

### P1 — Job Staging
- [ ] **6. Schema** — `makeMethod.finishToStorageUnitId`, `job.finishToStorageUnitId`. Propagate at job creation.
- [ ] **7. `get_job_staging_assessment` RPC** — per-material atPick/elsewhere/shortage/sourceShelf.
- [ ] **8. Edge fn ops** — `stageJob` (returns assessment), `generateStockTransfer` (creates stockTransfer lines for shortages).
- [ ] **9. `$jobId.staging.tsx`** route + UI.

## Out of scope (still deferred)
- Picking Waves (explicitly archived in rough notes)
- FEFO/expiry-aware proposal
- Refactor `pick/index.ts` ↔ `issue/index.ts` shared consumption helper

## Checkpoints
After each numbered item: type-check passes, commit with `feat(picking-list):` prefix, update this file's checkbox.
