# Picking List P0 Functional Test Guide (Empty DB)

Date: 2026-05-06  
Scope: REQ-FUN-INVENTORY-004 P0 only  
File: `PICKING-LIST-P0-TESTING.md`

This file tests only P0 functionality.  
No sidebar/navigation UI checks are included.

---

## 1) Pre-Flight

1. Start local DB and services:
   - `npx supabase start`
   - `npx supabase functions serve`
   - `npm run dev -w erp`
2. Apply pending migrations:
   - `npm run db:migrate`
3. Restart ERP + functions once migrations are done.
4. Login with a user having at least:
   - `inventory_view`
   - `inventory_create`
   - `inventory_update`
   - `inventory_delete`
   - `inventory_approve` (needed for exceptional confirm paths)

Base URL: `http://localhost:3000`

---

## 2) Seed Data (UI Only, Empty DB Friendly)

Use these exact names and quantities so expected values are easy.

### SD-01 Create Location
1. Go to `Resources -> Locations`.
2. Click `New`.
3. Create location: `PLANT-P0`.
4. Open it and copy `locationId` from URL.

Expected:
- Location created and ID available.

### SD-02 Create Storage Units
1. Go to `Inventory -> Storage Units`.
2. Create parent storage unit: `ZONE-A`, Location = `PLANT-P0`.
3. If you get duplicate error (`storageUnit_name_locationId_key`), do not re-create:
   - clear search/filter
   - refresh page once
   - search `ZONE-A`
   - reuse the existing `ZONE-A`.
4. Create child shelf: `A1-PICK` (source shelf), Location = `PLANT-P0`, Parent = `ZONE-A`.
5. Create child shelf: `B1-OVERFLOW` (secondary shelf), Location = `PLANT-P0`, Parent = `ZONE-A`.
6. Create child shelf: `LINE-01` (destination shelf), Location = `PLANT-P0`, Parent = `ZONE-A`.
7. If child name also duplicates (leftover old data), use suffix names and continue:
   - `A1-PICK-P0`
   - `B1-OVERFLOW-P0`
   - `LINE-01-P0`

Expected:
- All 4 storage units in same location.
- Hierarchy:
  - Parent: `ZONE-A`
  - Children: `A1-PICK`, `B1-OVERFLOW`, `LINE-01`

### SD-03 Create Non-Tracked Item
1. Go to `Items -> Parts -> New`.
2. Create item:
   - Part ID: `RAW-NT-01`
   - Description: `Non tracked raw material`
   - Tracking Type: Inventory (non-batch/non-serial)
   - Default Method Type: `Pull from Inventory`
   - UoM: `Each`
3. Save.

Expected:
- Item `RAW-NT-01` exists.

### SD-04 Add Stock for Non-Tracked Item
1. Go to `Inventory -> Quantities`.
2. Find `RAW-NT-01`.
3. Click `Update Inventory` (or equivalent adjustment action).
4. Add positive quantity `150` to shelf `A1-PICK`.

Expected:
- On-hand at `A1-PICK` for `RAW-NT-01` = `150`.

### SD-05 Create Tracked Items (Serial + Batch)
1. Go to `Items -> Parts -> New`.
2. Create serial-tracked item:
   - Part ID: `RAW-TR-SR-01`
   - Description: `Tracked raw material (serial)`
   - Tracking Type: `Serial`
   - Default Method Type: `Pull from Inventory`
   - UoM: `Each`
3. Save.
4. Create batch-tracked item:
   - Part ID: `RAW-TR-BT-01`
   - Description: `Tracked raw material (batch)`
   - Tracking Type: `Batch`
   - Default Method Type: `Pull from Inventory`
   - UoM: `Each`
5. Save.

Expected:
- `RAW-TR-SR-01` exists and is serial tracked.
- `RAW-TR-BT-01` exists and is batch tracked.

### SD-06 Receive Tracked Stock (Serial + Batch)
1. Create source document first (required by this receipt UI):
   - Go to `Purchasing/Procurement -> Purchase Orders -> New`.
   - Location = `PLANT-P0`.
   - Add lines:
     - `RAW-TR-SR-01`, qty `2`
     - `RAW-TR-BT-01`, qty `35`
   - Save/Release PO and copy its PO ID.
2. Go to `Inventory -> Receipts`.
3. Create new receipt:
   - Location = `PLANT-P0`
   - Source Document = `Purchase Order`
   - Source Document ID = select the PO created above from dropdown (must select actual option, not only typed text)
   - Save header
4. Create receipt line for serial item `RAW-TR-SR-01` into shelf `A1-PICK`:
   - `SER-TR-001`, qty `1`
   - `SER-TR-002`, qty `1`
   - `SER-TR-003`, qty `1` (optional spare for negative tests)
5. Create receipt line for batch item `RAW-TR-BT-01` into shelf `A1-PICK`:
   - `LOT-BT-001`, qty `35`
   - `LOT-BT-002`, qty `20` (optional spare)
6. Post/complete receipt(s).
7. Go to `Inventory -> Tracked Entities` and verify created serials/lots are `Available`.

Expected:
- Available serial entities exist in `A1-PICK` with status `Available`.
- Available batch entities exist in `A1-PICK` with status `Available`.

### SD-07 Create Finished Good Item
1. Go to `Items -> Parts -> New`.
2. Create finished good:
   - Part ID: `FG-PL-01`
   - Description: `Picking list FG`
   - UoM: `Each`
3. Save.

Expected:
- `FG-PL-01` exists.

### SD-08 Create Job with BOM Materials
1. Go to `Production -> Jobs -> New`.
2. Create single job:
   - Item: `FG-PL-01`
   - Quantity: `1`
   - Location: `PLANT-P0`
3. In BOM/Material lines add:
   - Material 1: `RAW-NT-01`, method `Pull from Inventory`, source shelf `A1-PICK`, required qty `100`
   - Material 2: `RAW-TR-SR-01`, method `Pull from Inventory`, source shelf `A1-PICK`, required qty `2`
   - Material 3: `RAW-TR-BT-01`, method `Pull from Inventory`, source shelf `A1-PICK`, required qty `25`
4. Save job.
5. Keep job in Draft/Planned (manual PL generation is fine).
6. Copy internal `jobId` from URL (`job_xxx`).

Expected:
- Job has 3 qualifying pull-from-inventory materials.

---

## 3) P0 Functional Test Cases

### TC-P0-01 Generate Picking List (Happy Path)
1. Go to `Inventory -> Picking Lists`.
2. Click `New Picking List`.
3. Select:
   - Job = the job from SD-08
   - Location = `PLANT-P0`
4. Click `Generate`.

Expected:
- PL created in `Draft`.
- Redirect to `/x/picking-list/<id>`.
- Lines include all materials:
   - `RAW-NT-01` estimated `100`
   - `RAW-TR-SR-01` estimated `2`
   - `RAW-TR-BT-01` estimated `25`

### TC-P0-02 Duplicate Active PL Block
1. Without confirming/cancelling first PL, try creating another PL for same job + location.

Expected:
- Error for active PL uniqueness conflict.
- Original PL remains unchanged.

### TC-P0-03 Release PL
1. Open Draft PL detail.
2. Click `Release`.

Expected:
- Status changes `Draft -> Released`.
- Picking actions enabled.

### TC-P0-04 Non-Tracked Partial Pick
1. On line `RAW-NT-01`, enter picked qty `60`.
2. Save/blur.

Expected:
- PL status becomes `In Progress` (if first pick).
- Line values:
   - picked = `60`
   - outstanding = `40`
   - overpick = `0`

### TC-P0-05 Non-Tracked Overpick Within 2x
1. Change same line picked qty from `60` to `110`.

Expected:
- Allowed (because 110 <= 200).
- Line values:
   - picked = `110`
   - outstanding = `0`
   - overpick = `10`

### TC-P0-06 Non-Tracked Hard Block > 2x
1. Set same line picked qty to `201`.

Expected:
- Request blocked.
- Error says cannot pick more than `2x` required quantity.
- Previously saved qty remains unchanged.

### TC-P0-07 Serial Pick Auto-Split
1. Open serial tracked line `RAW-TR-SR-01` (required `2`).
2. Click `Scan` and scan tracked entity `SER-TR-001` (qty `1`).

Expected:
- Current line closes with picked qty `1`.
- New sibling line created automatically for remainder `1` on same shelf.
- Remainder line has `pickedTrackedEntityId = null`.

### TC-P0-08 Serial Pick Second Entity
1. On remainder line (`1`), scan `SER-TR-002`.
2. Pick qty `1` from that entity.

Expected:
- Serial tracked required qty fully picked (`1 + 1 = 2`).
- No outstanding on serial tracked material.

### TC-P0-09 Batch Pick Auto-Split
1. Open batch tracked line `RAW-TR-BT-01` (required `25`).
2. Click `Scan` and scan `LOT-BT-001`.
3. Pick qty `15` from that lot.

Expected:
- Current line picked qty becomes `15`.
- New sibling line is created for remainder `10`.
- Remainder line has `pickedTrackedEntityId = null`.

### TC-P0-10 Batch Remainder Pick
1. On remainder line (`10`), scan `LOT-BT-001` again (or `LOT-BT-002`).
2. Pick qty `10`.

Expected:
- Batch tracked required qty fully picked (`15 + 10 = 25`).
- No outstanding on batch tracked material.

### TC-P0-11 Scan Validation Wrong Entity
1. On any tracked line, scan an invalid/non-existent ID like `LOT-DOES-NOT-EXIST`.

Expected:
- Clear error message.
- No pick update.

### TC-P0-12 Unpick Line (In Progress)
1. Click unpick/undo on non-tracked line.

Expected:
- Picked qty resets to `0`.
- Outstanding recalculates to original required qty.
- No ledger posting yet (since confirm not done).

### TC-P0-13 Regenerate Rules (Allowed)
1. Keep PL in `Draft` or `Released` with no meaningful picks.
2. Click `Regenerate Lines`.

Expected:
- Lines are regenerated.
- Status remains valid.

### TC-P0-14 Regenerate Rules (Blocked)
1. Make sure PL is `In Progress` and at least one line has picked qty > 0.
2. Click `Regenerate Lines`.

Expected:
- Blocked with message to confirm/cancel first.
- Existing picks remain.

### TC-P0-15 Confirm with Full Picks
1. Ensure lines are picked as:
   - `RAW-NT-01` picked `100`
   - `RAW-TR-SR-01` picked `2`
   - `RAW-TR-BT-01` picked `25`
2. Click `Confirm`.

Expected:
- PL status `Confirmed`.
- Consumption ledger entries created.
- `jobMaterial.quantityIssued` increments by picked quantities.
- Tracked entities consumed quantities move to `Consumed` state.

### TC-P0-16 Confirm With Outstanding Requires Reason
1. Create a fresh PL for same job remainder case, or use a different job.
2. Keep one line short, e.g. non-tracked picked `70` out of `100`.
3. Click `Confirm` without shortage reason.

Expected:
- Confirmation blocked.
- Error: shortage reason required.

4. Enter reason: `Stock not available on shelf` and confirm again.

Expected:
- Confirm succeeds.
- Ledger only for picked amounts.

### TC-P0-17 Reverse Confirmed Picking List
1. Open a `Confirmed` PL.
2. Trigger `Reverse Consumption`.

Expected:
- Reverse succeeds only for `Confirmed` PL.
- Positive adjustment ledger entries posted.
- `jobMaterial.quantityIssued` reduced back accordingly.
- Tracked entities restored to `Available` only if still `Consumed`.
- PL status becomes `Cancelled`.

### TC-P0-18 Delete Rules
1. Open `Draft` or `Cancelled` PL and delete.

Expected:
- Delete allowed.

2. Try deleting `Released`, `In Progress`, or `Confirmed`.

Expected:
- Delete blocked / option not shown.

### TC-P0-19 Sequential PL Remainder Behavior
1. Job material requirement = `100`.
2. First PL: pick and confirm only `70`.
3. Create second PL for same job/location.

Expected:
- Second PL generates for remainder around `30`.
- Confirms incremental issuance behavior.

### TC-P0-20 Soft Allocation Visibility
1. Keep PL-A in `Released/In Progress` with outstanding qty for item `RAW-NT-01`.
2. Open another relevant PL/item context for same item.

Expected:
- Soft allocation badge visible (reserved on active PLs).
- Current PL should not self-count when exclusion parameter is passed.

### TC-P0-21 Permission Enforcement (Backend)
1. Login user with only `inventory_view` and attempt mutation actions (generate/release/pick/confirm/delete).

Expected:
- Mutations blocked server-side with permission errors.

2. Login user with update/create/delete/approve and retry.

Expected:
- Allowed according to action type.

---

## 4) Quick SQL Verification (Optional)

Run in local SQL editor if you want strict verification.

### Check PL and Lines
```sql
select p.id, p."pickingListId", p.status, p."jobId", p."locationId"
from "pickingList" p
order by p."createdAt" desc
limit 5;

select l."pickingListId", l."itemId", l."estimatedQuantity", l."pickedQuantity",
       l."outstandingQuantity", l."overPickQuantity", l."pickedTrackedEntityId"
from "pickingListLine" l
where l."pickingListId" = '<PL_ID>';
```

### Check Ledger Posting
```sql
select "entryType", "documentType", "documentId", "documentLineId", "itemId", quantity, "trackedEntityId"
from "itemLedger"
where "documentId" = '<JOB_ID>'
order by "createdAt" desc;
```

### Check Issued Qty Rollup
```sql
select id, "itemId", "quantityToIssue", "quantityIssued"
from "jobMaterial"
where "jobId" = '<JOB_ID>';
```

### Check Tracked Entity Status
```sql
select id, status, quantity, "storageUnitId"
from "trackedEntity"
where "itemId" in ('<RAW_TR_SR_ITEM_ID>', '<RAW_TR_BT_ITEM_ID>')
order by "createdAt";
```

---

## 5) Pass Criteria for P0 Sign-Off

P0 is considered pass if all these are true:
1. PL lifecycle works: Draft -> Released -> In Progress -> Confirmed/Cancelled.
2. Non-tracked picking supports normal, overpick (<=2x), and hard block (>2x).
3. Tracked scan validates entity and auto-split works for partial entity qty.
4. Confirm posts ledger and updates `jobMaterial.quantityIssued`.
5. Reverse works for Confirmed PL and restores accounting/stock safely.
6. Regenerate rules enforced correctly.
7. Permission checks enforced server-side.
8. Sequential remainder PL behavior works.
9. Soft allocation visible without hard reservation writes.

---

## 6) Notes

- This guide intentionally excludes P1/P2/P3 features.
- Picking Waves are out of scope for this file.
- If a step fails, capture:
  - PL ID
  - Job ID
  - Exact error text
  - screenshot + network request payload
