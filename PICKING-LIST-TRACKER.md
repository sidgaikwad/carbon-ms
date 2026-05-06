# Picking List Feature Tracker (REQ-FUN-INVENTORY-004)

> Last updated: 2026-05-06  
> Branch: `siddharth/Picking-list`  
> Status: **P0 Complete ✅ — Pending migration + smoke test before merge**

---

## P0 — Core Picking List (MVP) ✅

### Schema & Database

| Item | Status | Notes |
|------|--------|-------|
| `pickingList` table | ✅ Done | Header, status enum, sequence PL-00001 |
| `pickingListLine` table | ✅ Done | estimatedQty, pickedQty, outstandingQty (GENERATED), overPickQty (GENERATED) |
| `jobMaterialId` nullable on `pickingListLine` | ✅ Done | Migration `20260505000002` — manual lines have `jobMaterialId: null` |
| `job.pickingStatus` column + trigger | ✅ Done | Trigger recomputes on PL insert/update/delete |
| `job.autoGeneratePickingList` BOOLEAN | ✅ Done | In core migration |
| `companySettings.usePickingLists` BOOLEAN | ✅ Done | In core migration |
| `companySettings.defaultAutoGeneratePickingList` BOOLEAN | ✅ Done | In core migration |
| `methodMaterial.requiresPicking` / `jobMaterial.requiresPicking` BOOLEAN | ✅ Done | In core migration |
| `workCenter.defaultStorageUnitId` FK → storageUnit | ✅ Done | In core migration |
| `generate_picking_list_lines` RPC | ✅ Done | Creates one line per qualifying jobMaterial |
| RPC shelf preference via `pickMethod` | ✅ Done | Migration `20260505000001` — `pickMethod.defaultStorageUnitId` preferred over `jobMaterial.storageUnitId` |
| Partial unique index (one active PL per job+location) | ✅ Done | In core migration |

**Migrations to apply (in order):**
1. `20260505000000_picking-lists.sql` — core schema
2. `20260505000001_picking-lists-rpc-uplift.sql` — RPC + pickMethod shelf preference
3. `20260505000002_picking-list-line-optional-job-material.sql` — nullable jobMaterialId

---

### Edge Function (`packages/database/supabase/functions/pick/index.ts`)

| Operation | Status | Notes |
|-----------|--------|-------|
| Auth: JWT via `getSupabase(authorizationHeader)` | ✅ Done | Service role only for API key path |
| `generatePickingList` | ✅ Done | Creates header + calls RPC |
| `regeneratePickingList` | ✅ Done | Wipes lines + re-runs RPC |
| `releasePickingList` | ✅ Done | Draft → Released |
| `cancelPickingList` | ✅ Done | Any non-Confirmed state |
| `pickInventoryLine` | ✅ Done | Non-tracked items; over-pick hard block at 2× |
| `pickTrackedEntityLine` | ✅ Done | Validates entity; auto-splits if entity.qty < outstanding |
| `unpickLine` | ✅ Done | Resets pickedQuantity to 0 |
| `confirmPickingList` | ✅ Done | Posts consumption ledger; requires shortageReason if outstanding > 0; guards `jobMaterialId` null for manual lines |
| `reversePickingList` | ✅ Done | Posts Positive Adjmt. reversal ledger; rolls back quantityIssued; restores tracked entities; guards `jobMaterialId` null for manual lines |
| Over-pick hard block (2×) | ✅ Done | In `pickInventoryLine` |
| Tracked auto-split | ✅ Done | Uses `estimatedQuantity` update (NOT `adjustedQuantity`) to close current line |
| `adjustedQuantity` reserved for P3 | ✅ Done | NOT used in pick flow; supervisor-only override |

---

### ERP Service Layer (`inventory.service.ts`)

| Function | Status | Notes |
|----------|--------|-------|
| `getPickingLists` | ✅ Done | List with filters |
| `getPickingList` | ✅ Done | Single PL with lines |
| `getPickingListLines` | ✅ Done | Lines for a PL |
| `deletePickingList` | ✅ Done | Hard delete |
| `upsertPickingList` | ✅ Done | Create/update header |
| `getActiveAllocations` | ✅ Done | Sum outstanding qty across active PLs; supports `excludePickingListId` |

---

### API Routes

| Route | Status | Notes |
|-------|--------|-------|
| `GET /api/inventory/soft-allocations?itemIds=...&excludePickingListId=...` | ✅ Done | Soft allocation badge data; excludes current PL from self-count |
| `GET /api/inventory/jobs` | ✅ Done | Jobs list requiring only `view: inventory` (not `view: production`) |

---

### ERP Routes

| Route | Status | Notes |
|-------|--------|-------|
| `inventory+/picking-lists.tsx` | ✅ Done | List page |
| `inventory+/picking-lists.new.tsx` | ✅ Done | New PL drawer; Combobox selectors for Job + Location |
| `picking-list+/_layout.tsx` | ✅ Done | Layout with Outlet |
| `picking-list+/$id.tsx` | ✅ Done | Detail page |
| `picking-list+/$id.status.tsx` | ✅ Done | Release / Cancel actions |
| `picking-list+/$id.confirm.tsx` | ✅ Done | Confirm; surfaces backend error in response data |
| `picking-list+/$id.reverse.tsx` | ✅ Done | Reverse confirmed PL |
| `picking-list+/$id.regenerate.tsx` | ✅ Done | Wipe lines + regenerate |
| `picking-list+/$id.line.quantity.tsx` | ✅ Done | Pick quantity (non-tracked) |
| `picking-list+/$id.scan.$lineId.tsx` | ✅ Done | Scan tracked entity |
| `picking-list+/$id.unpick.$lineId.tsx` | ✅ Done | Unpick a line |
| `picking-list+/$id.line.new.tsx` | ✅ Done | Manually add a line (`jobMaterialId: null`) |
| `picking-list+/$id.line.$lineId.tsx` | ✅ Done | Edit line (adjustedQuantity) |
| `picking-list+/$id.line.$lineId.delete.tsx` | ✅ Done | Delete line |
| `picking-list+/$id.pdf.tsx` | ✅ Done | Print-CSS printable page; sorted by storageUnit |
| `picking-list+/delete.$id.tsx` | ✅ Done | Delete PL |

---

### UI Components (`modules/inventory/ui/PickingLists/`)

| Component | Status | Notes |
|-----------|--------|-------|
| `PickingListsTable.tsx` | ✅ Done | List table with filters |
| `PickingListHeader.tsx` | ✅ Done | Release/Confirm/Cancel/Reverse/PDF actions; Confirm opens modal |
| `PickingListLines.tsx` | ✅ Done | Lines list; qty input for non-tracked; scan for tracked; Add/Edit/Delete; soft allocation badge |
| `PickingListStatus.tsx` | ✅ Done | Status badge |
| `PickingListConfirmModal.tsx` | ✅ Done | Confirm dialog with shortage reason; shows inline backend errors |

---

### UX & Navigation

| Item | Status | Notes |
|------|--------|-------|
| Navigation link in `useInventorySubmodules.tsx` | ✅ Done | Under Manage group, `LuClipboardList` icon |
| `PrimaryNavigation.tsx` updated | ✅ Done | |
| All `path.to.*` picking list paths in `path.ts` | ✅ Done | 14 paths added |
| Job Combobox uses `view: inventory` permission | ✅ Done | Hits `/api/inventory/jobs` not `/api/production/jobs` |
| Confirm modal shows inline backend errors | ✅ Done | |
| Printable PDF page (print-CSS trick, no library) | ✅ Done | |
| Soft allocation amber badge per line | ✅ Done | Excludes current PL from self-count |
| Reverse button in header dropdown | ✅ Done | Only visible for Confirmed PLs |

---

### Code Review Fixes Applied

| Bug | Severity | Fix |
|-----|----------|-----|
| `documentType: "Job Reversal"` invalid DB enum | 🔴 Critical | Changed to `"Job Consumption"` + `entryType: "Positive Adjmt."` |
| Auto-split misusing `adjustedQuantity` | 🔴 Critical | Switched to conditional `estimatedQuantity` spread |
| Soft-allocation ignoring `excludePickingListId` | 🔴 Critical | Wired param through service + API route |
| Manual line `jobMaterialId` sentinel using PL id | 🔴 Critical | Migration makes column nullable; insert uses `null` |
| confirm/reverse loop pushing `null` ids for manual lines | 🔴 Critical | `if (line.jobMaterialId)` guard on both `push` calls |
| Job Combobox requires `view: production` (wrong permission) | 🟡 Medium | New `/api/inventory/jobs` route with `view: inventory` |

---

### To Deploy P0

```bash
# 1. Apply migrations
cd packages/database
npm run db:migrate

# 2. Restart edge functions (pick up reversePickingList + all fixes)
supabase functions serve

# 3. Restart ERP dev server
npm run dev -w erp
```

---

## P1 — Operational Enhancements (NOT STARTED)

| Feature | Description |
|---------|-------------|
| **Job Staging** | `stageJob` + `generateStockTransfer` edge fn operations — moves picked material to line-side staging location |
| **Auto-generate PL on job release** | Hook on `job.status` change to Released triggers `generatePickingList` when `job.autoGeneratePickingList = true` |
| **Multi-shelf allocation in RPC** | Split one jobMaterial across multiple storage units by available qty (currently one line per material) |
| **Over-pick warning tier** | Soft warning when picked > 1× but ≤ 2× estimated (currently jumps straight to hard block at 2×) |
| **MES Picking Screen** | Scan-first mobile-friendly screen under MES routes (`mes/picking-lists.tsx`, `mes/picking-list.$id.tsx`) |
| **Picking Waves** | Group multiple PLs into a wave for warehouse batch processing — explicitly out of MVP scope |

---

## P2 — Movements Feed (NOT STARTED)

| Feature | Description |
|---------|-------------|
| **Movements Feed** | `inventory+/movements.tsx` — chronological feed of all item ledger entries; filterable by item, job, date |
| **Movement detail** | Click-through to source document (PL, receipt, adjustment) |
| **Movement export** | CSV export of itemLedger for a date range |

---

## P3 — Incident Reporting + Supervisor Overrides (NOT STARTED)

| Feature | Description |
|---------|-------------|
| **Production Incident table** | `productionIncident` — logs discrepancies found during picking (damaged goods, wrong item, missing stock) |
| **Incident → PL adjustment** | Incident resolution can trigger `adjustedQuantity` update on `pickingListLine` (this is the intended use of that column) |
| **Supervisor override UI** | Supervisor can set `adjustedQuantity` per line via ERP route (currently `$id.line.$lineId.tsx` allows this, but no incident linking) |
| **Shortage auto-close** | When confirmed with shortage, auto-create incident record linking shortage reason to job |

---

## Status Summary

```
P0 Core  ████████████████████  100% ✅  (pending deploy + smoke test)
P1       ░░░░░░░░░░░░░░░░░░░░    0% 
P2       ░░░░░░░░░░░░░░░░░░░░    0%
P3       ░░░░░░░░░░░░░░░░░░░░    0%
```
