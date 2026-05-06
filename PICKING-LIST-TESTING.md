# Picking List Manual UI Testing Guide

Date: 2026-05-05
Feature: REQ-FUN-INVENTORY-004 (current implementation)
File: PICKING-LIST-TESTING.md

## 1) Environment Setup

- Start ERP app: `npm run dev -w erp`
- Start Supabase local: `npx supabase start`
- Serve edge functions: `npx supabase functions serve`
- Ensure migration exists: `20260505000000_picking-lists.sql`
- Login with a user that has inventory permissions

Base URL: `http://localhost:3000`

## 2) Seed Data From UI (No DB Assumptions)

Use this once before running test cases.

### SD-01 Create a Location
1. Open `Resources -> Locations`
2. Click `New`
3. Create one location (example: `Main Plant`)
4. Open the created record and copy ID from URL (`/x/resources/locations/<locationId>`)

Expected:
- Location exists and `locationId` is available from URL.

### SD-02 Create Storage Units (Shelves)
1. Open `Inventory -> Storage Units`
2. Click `New`
3. Create first shelf in the location (example: `A1-PICK`)
4. Save it
5. Click `New` again and create second shelf (example: `LINE-01`)
6. Optional: set `Parent Storage Unit` to first shelf if you want hierarchy
7. Copy IDs from URLs when opening each storage unit

Expected:
- Storage units created for same location.
- Note: On the first shelf creation, `Parent Storage Unit` can be empty because no parent exists yet.

### SD-03 Create One Item For Non-Tracked Flow
1. Open `Items -> Parts` (or Materials/Consumables)
2. Create an item (example: `TEST-PART-NT`)
3. Keep it non-tracked (no batch/serial requirement)

Expected:
- Item is available for inventory adjustment and job material usage.

### SD-04 Add On-Hand Quantity From UI
1. Open `Inventory -> Quantities`
2. Find the item from SD-03
3. Use quantity adjustment action
4. Post positive adjustment to source shelf (`A1-PICK`), quantity `50`

Expected:
- On-hand quantity is visible at source shelf as `50`.

### SD-05 Create One Job With Pull From Inventory Material
1. Open `Production -> Jobs -> New`
2. Create job in same location
3. Open job detail and add material line in method/BOM area:
   - Method type: `Pull from Inventory`
   - Quantity: `10`
   - Source storage unit: source shelf from SD-02
   - `requiresPicking` should be true (default true in current design)
4. Move job to a usable state (Draft/Planned is fine for manual PL generation)
5. Copy job internal ID from URL (`/x/job/<jobId>`)

Expected:
- Job has at least one qualifying material for PL generation.
- If `requiresPicking` toggle is not visible in this UI, continue: in current setup it defaults to true.

### SD-06 Optional Data For Tracked Scan Tests
Only needed for scan cases.
1. Create another item that uses batch/serial tracking
2. Create stock with tracked entity in `Available` status (via receipt or tracked inventory flow)
3. Ensure tracked entity belongs to same item and has quantity > 0
4. Keep tracked entity in same company/location scope

Expected:
- At least one valid `trackedEntityId` exists for scan tests.

## 3) Core Navigation and List Tests

### TC-01 Sidebar Navigation
Steps:
1. Open ERP
2. Go to `Inventory` module
3. Verify `Picking Lists` link exists

Expected:
- Click opens `/x/inventory/picking-lists`.

### TC-02 List Page Load
Steps:
1. Open `/x/inventory/picking-lists`

Expected:
- List table renders
- New button visible if user has create permission
- Breadcrumb includes Inventory and Picking Lists

### TC-03 Empty/List State
Steps:
1. Open list page before creating any PL

Expected:
- Empty table state or no rows shown
- New button still available (with create permission)

## 4) New Picking List Drawer Tests

### TC-04 Drawer Opens
Steps:
1. On list page click `New Picking List`

Expected:
- Right drawer opens at `/x/inventory/picking-lists/new`.

### TC-05 Required Validation
Steps:
1. Leave `Job ID` and `Location ID` empty
2. Click `Generate`

Expected:
- Validation errors shown on required fields (schema-driven)
- Drawer stays open (no bounce redirect)

### TC-06 Successful Create From UI Inputs
Steps:
1. Paste `jobId` from SD-05
2. Paste `locationId` from SD-01
3. Optional: set due date and destination storage unit ID
4. Click `Generate`

Expected:
- Redirect to `/x/picking-list/<id>`
- Toast: picking list created
- Header and lines load

### TC-07 Duplicate Active PL Block
Steps:
1. Keep first PL in non-Confirmed/non-Cancelled status
2. Try creating another with same `jobId + locationId`

Expected:
- Error from backend (active unique constraint behavior)
- Existing PL remains intact

### TC-08 Company Switch Off
Steps:
1. Set `companySettings.usePickingLists = false` (admin/data setup)
2. Try generate again

Expected:
- Backend error: picking lists are disabled for this company.

## 5) Detail, Release, Pick, Scan

### TC-09 Detail Header and Lines
Steps:
1. Open created PL detail

Expected:
- Header shows PL readable ID, status, assignee control
- Draft: Release enabled, Confirm disabled
- Lines table loads with required quantities

### TC-10 Release
Steps:
1. Click `Release`

Expected:
- Status changes Draft -> Released
- Confirm becomes enabled

### TC-11 Non-Tracked Quantity Pick
Steps:
1. On Released PL, enter quantity `6` on non-tracked line (line estimated qty = `10`)
2. Blur input

Expected:
- Pick saved
- If first pick: PL status becomes In Progress
- Outstanding and picked visuals update
- Picked = `6`, Outstanding = `4`

### TC-12 Over-Pick Math
Steps:
1. Enter picked quantity `12` on line with estimated `10`

Expected:
- Pick is accepted in current implementation
- `overPickQuantity = 2`
- `outstandingQuantity = 0`

### TC-13 Unpick (In Progress Only)
Steps:
1. Click undo on picked line

Expected:
- pickedQuantity -> 0
- pickedTrackedEntityId -> null
- outstanding recalculates
- For estimated `10`, outstanding returns to `10`

### TC-14 Regenerate Rules
Steps:
1. Draft or Released: regenerate
2. In Progress with any picked quantity: try regenerate
3. Confirmed/Cancelled: check menu

Expected:
- Draft/Released regenerate allowed
- In Progress with picked lines blocked
- Confirmed/Cancelled regenerate hidden or blocked

### TC-15 Scan Modal Opens (Tracked line)
Precondition:
- Tracked line exists (SD-06)

Steps:
1. Click `Scan` on tracked line

Expected:
- Scan modal opens with input and Pick button.

### TC-16 Tracked Scan Success
Steps:
1. Enter valid tracked entity ID
2. Pick/submit

Expected:
- Redirect back to PL detail
- Toast success
- Line shows picked tracked entity ID

### TC-17 Tracked Scan Validation Errors
Steps:
1. Scan non-existing ID
2. Scan wrong item entity
3. Scan non-Available entity

Expected:
- Clear validation error messages in modal
- No pick applied

## 6) Confirm, Cancel, Delete

### TC-18 Confirm Success (No Outstanding)
Steps:
1. Ensure all lines sufficiently picked (example: estimated `10`, picked `10` or more)
2. Click `Confirm`

Expected:
- Status -> Confirmed
- Ledger consumption entries posted
- jobMaterial.quantityIssued updated
- tracked entities moved to Consumed (for tracked picks)

### TC-19 Confirm With Outstanding
Steps:
1. Keep at least one line outstanding (example: estimated `10`, picked `6`)
2. Click Confirm without shortage reason

Expected:
- Error from backend: shortage reason required

Note:
- Current UI does not wire a dedicated shortage-reason modal in confirm flow.

### TC-20 Cancel Rules
Steps:
1. Cancel Draft/Released/In Progress
2. Try cancel Confirmed

Expected:
- Non-confirmed cancel allowed
- Confirmed cancel blocked

### TC-21 Delete Rules
Steps:
1. Delete Draft or Cancelled
2. Check Released/In Progress/Confirmed

Expected:
- Delete allowed only for Draft/Cancelled
- Other statuses blocked/hidden

## 7) List Filters and Search

### TC-22 Search by Picking List ID
Steps:
1. Use search box with `PL-` prefix

Expected:
- Matching rows filtered by pickingListId.

### TC-23 Status and Location Filters
Steps:
1. Apply status filter
2. Apply location filter

Expected:
- Rows filter correctly by selected values.

Note:
- Assignee filter behavior depends on table filter wiring. Validate in UI before relying on it.

## 8) Permissions

### TC-24 View-Only User
Expected:
- Can view list/detail
- Cannot release/pick/confirm/cancel/delete

### TC-25 Update User
Expected:
- Can release, pick, scan, confirm, cancel
- Cannot delete unless delete permission also granted

### TC-26 Delete User
Expected:
- Can delete only Draft/Cancelled

## 9) Not Yet Implemented / Known Limits

- `stageJob` and `generateStockTransfer` return `501 Not yet implemented (P1)`
- Confirm shortage-reason modal is not fully wired in main confirm button flow
- Some advanced roadmap features from full plan are not in this current branch yet

## 10) Quick Smoke Checklist

- [ ] Can open Picking Lists page
- [ ] Can open New Picking List drawer
- [ ] Required validation works without closing drawer
- [ ] Can create PL using Job ID + Location ID
- [ ] Can release PL
- [ ] Can pick non-tracked line
- [ ] Can unpick line in In Progress
- [ ] Can confirm fully picked PL
- [ ] Can cancel non-confirmed PL
- [ ] Can delete Draft/Cancelled PL
