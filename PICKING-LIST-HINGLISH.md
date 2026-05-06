# Picking List Feature — Hinglish Explanation
*Poora flow seedha, simple language mein*

---

## Yeh Feature Kya Hai?

Bhai, samajh lo ek manufacturing factory hai. Koi bhi product banane ke liye pehle raw materials
chahiye hote hain. Yeh materials different shelves pe rakhe hote hain warehouse mein. Abhi tak
operator ko manually jaana padta tha aur khud dhundhna padta tha ki kaun sa material kahan hai.

**Picking List** ek document hai jo batata hai:
- **Kaun sa material** chahiye
- **Kitni quantity** mein chahiye
- **Kahan se utha ke laao** (kaun si shelf)
- Aur ultimately — **confirm karo ki material issue ho gaya**

Jab confirm hota hai, tabhi consumption ledger mein entry jaati hai. Ek tarah se yeh ek **workflow
tool** hai, accounting ka document nahi. Ledger ka `documentId` hamesha **job ka ID** hota hai,
picking list ka nahi.

---

## Flow Step-by-Step

### Step 1 — Job Banana
Koi planner job banata hai — e.g. "100 units of Product ABC banana hai".

Job ke andar **Bill of Materials** hota hai — matlab kaun kaun se materials chahiye. Jis material
ka `methodType = 'Pull from Inventory'` aur `requiresPicking = true` ho, woh picking list mein
jaata hai.

```
Job created → job.pickingStatus = 'Not Generated'
```

### Step 2 — Picking List Auto-Generate
Jab job ka status `'Planned'` ya `'Ready'` hota hai:
- Agar `job.autoGeneratePickingList = true` hai
- Aur `companySettings.usePickingLists = true` hai
- Tab **automatically** picking list generate hoti hai

Ya planner manually bhi "Generate Picking List" button dabaa sakta hai.

```
PL banti hai → Status: Draft
job.pickingStatus = 'Generated'
```

### Step 3 — Lines Generate Hoti Hain
`generate_picking_list_lines` RPC run hoti hai jo har qualifying `jobMaterial` ke liye ek line
banati hai.

Har line mein hota hai:
- **Kaun sa item** chahiye
- **Kitni quantity** estimated hai
- **Kaun si shelf** (storageUnit) se uthana hai
- **Destination** — kahan jaana hai (workCenter ka line-side shelf ya operator manually set kare)

### Step 4 — Release
Planner "Release" karta hai → `Status: Released`

Ab operator dekh sakta hai ki yeh PL uske liye assign hai.

### Step 5 — Picking Shuru (Status: In Progress)
Operator warehouse jaata hai. Do tarah ke items hote hain:

**Non-tracked items** (e.g. generic bolts, paint):
- Operator quantity enter karta hai manually
- Input box mein likho kitna uthaaya

**Tracked items** (e.g. specific batch of steel, serialized component):
- Operator QR/barcode scanner se entity scan karta hai
- System validate karta hai:
  - Yeh entity is item ka hai? ✓
  - Status 'Available' hai? ✓
  - UoM match karta hai? ✓
- If valid → `pickedTrackedEntityId` set hota hai

Jaise hi pehli line pick hoti hai → `Status: In Progress`
`job.pickingStatus = 'In Progress'`

### Step 6 — Confirm
Jab sab lines pick ho jaayein, operator ya planner "Confirm" dabaata hai.

**Agar sab kuch theek hai:**
- Confirmation direct hoti hai

**Agar kuch outstanding quantity baaki hai:**
- `inventory_approve` permission chahiye
- Shortage reason mandatory hai

**Jab confirm hota hai, tab yeh sab hota hai (atomically):**
1. Har picked line ke liye → `itemLedger` mein `Consumption` entry
   - `documentId = jobId` (accounting ke liye yahi important hai)
   - `quantity = -pickedQuantity`
2. `jobMaterial.quantityIssued += pickedQuantity`
3. Tracked entities ke liye → `status = 'Consumed'`
4. `trackedActivity` banta hai `type='Consume'` ke saath
5. `trackedActivityInput` links banate hain (traceability ke liye)
6. PL lock ho jaati hai → `Status: Confirmed`
7. `job.pickingStatus = 'Complete'` (agar sab materials issue ho gaye)

### Step 7 — Done!
Materials officially consume ho gaye. Production chal sakti hai.

---

## Key Concepts Seedha Seedha

### Soft Allocation (Reservation Nahi)
Hum **hard reservation** nahi karte. Iska matlab hai ki agar ek PL mein item A ka
`outstandingQuantity > 0` hai, toh doosri PL bhi same item ko propose kar sakti hai.

Lekin UI mein ek badge show hota hai: *"Soft allocated on PL-00123"* — taaki planner ko
pata chale ki yeh material pehle se kisi ke liye planned hai.

```sql
availableToPromise = quantityOnHand - softAllocated
softAllocated = SUM(outstandingQuantity) WHERE status IN ('Released','In Progress')
```

### Multiple PLs Per Job
Ek job ke liye multiple PLs ho sakti hain — sequentially. Pehli PL ne 50 units
issue kiye, doosri PL remaining 50 ke liye banegi. `quantityToIssue` automatically
computed column hai: `GREATEST(estimatedQuantity - quantityIssued, 0)`.

### Tolerance System
- `item.overpickTolerancePercent` > `itemGroup.overpickTolerancePercent` > `companySettings.defaultOverpickTolerancePercent` (default 2%)
- 2% se zyada over-pick → warning dialog
- 100% se zyada over-pick → hard block

### 3-Level Opt-in
```
Company Level: companySettings.usePickingLists = false → koi PL nahi kabhi
Job Level:     job.autoGeneratePickingList = false → is job ke liye manual only
Material Level: jobMaterial.requiresPicking = false → yeh material PL mein nahi aayega
```

---

## Database Tables

### `pickingList`
Main document — ek per active workflow per job+location.

| Column | Kya Hai |
|--------|---------|
| `pickingListId` | Human-readable ID (PL-00001) |
| `jobId` | Kis job ke liye |
| `locationId` | Kis factory/location mein |
| `status` | Draft → Released → In Progress → Confirmed |
| `assignee` | Kaun operator kar raha hai |
| `confirmedAt` | Kab confirm hua |
| `shortageReason` | Kyon kuch material nahi mila |

### `pickingListLine`
Ek row per material per shelf.

| Column | Kya Hai |
|--------|---------|
| `estimatedQuantity` | Original snapshot — kitna chahiye tha |
| `adjustedQuantity` | Incident ke baad modify hua (P3 feature) |
| `pickedQuantity` | Operator ne kitna actually uthaya |
| `outstandingQuantity` | GENERATED: remaining to pick |
| `overPickQuantity` | GENERATED: kitna zyada utha liya |
| `pickedTrackedEntityId` | Kaun si specific entity scan ki |
| `storageUnitId` | Source shelf — kahan se lena hai |
| `destinationStorageUnitId` | Destination shelf — kahan rakhna hai |

---

## Status Flow

```
Draft ──[Release]──▶ Released ──[First pick]──▶ In Progress ──[Confirm]──▶ Confirmed
  │                     │                           │
  └────────────────[Cancel]──────────────────────────┘
```

---

## Permissions

| Action | Permission |
|--------|-----------|
| PL create karo | `inventory_create` |
| Release, pick, edit | `inventory_update` |
| Cancel In Progress | `inventory_delete` |
| Normal confirm | `inventory_update` |
| Confirm with shortage OR over-pick | `inventory_approve` |
| Delete | `inventory_delete` (only Draft/Cancelled) |

---

## Architecture Summary

```
BOM (methodMaterial)
  ↓ job creation
jobMaterial (quantityToIssue = estimatedQty - issuedQty)
  ↓ generatePickingList edge fn
pickingList header + pickingListLine rows (per shelf)
  ↓ operator picks
pickedQuantity update (non-tracked: qty form, tracked: scan modal)
  ↓ confirmPickingList edge fn
itemLedger Consumption (documentId = jobId)  ← accounting yahan
jobMaterial.quantityIssued += picked          ← demand tracking yahan
trackedEntity.status = 'Consumed'             ← traceability yahan
trackedActivity + trackedActivityInput        ← DAG yahan
```

---

## Files Jo Bane Hain (POC)

### Database
- `20260505000000_picking-lists.sql` — schema, RLS, triggers, RPC

### Edge Function
- `packages/database/supabase/functions/pick/index.ts` — sab operations

### ERP Service/Models
- `inventory.service.ts` — `getPickingLists`, `getPickingList`, `getPickingListLines`, etc.
- `inventory.models.ts` — validators + status type arrays
- `types.ts` — `PickingList`, `PickingListDetail`, `PickingListLine` types

### ERP Routes
- `routes/x+/inventory+/picking-lists.tsx` — list view
- `routes/x+/picking-list+/$id.tsx` — detail view
- `routes/x+/picking-list+/new.tsx` — create form
- `routes/x+/picking-list+/$id.status.tsx` — Release/Cancel action
- `routes/x+/picking-list+/$id.confirm.tsx` — Confirm action
- `routes/x+/picking-list+/$id.regenerate.tsx` — Regenerate lines
- `routes/x+/picking-list+/$id.line.quantity.tsx` — Non-tracked pick
- `routes/x+/picking-list+/$id.scan.$lineId.tsx` — Tracked entity scan
- `routes/x+/picking-list+/$id.unpick.$lineId.tsx` — Unpick a line
- `routes/x+/picking-list+/delete.$id.tsx` — Delete

### ERP UI Components
- `ui/PickingLists/PickingListsTable.tsx` — list table
- `ui/PickingLists/PickingListHeader.tsx` — detail header with actions
- `ui/PickingLists/PickingListLines.tsx` — lines list with pick/scan UI
- `ui/PickingLists/PickingListStatus.tsx` — status badge
- `ui/PickingLists/PickingListConfirmModal.tsx` — confirm dialog

### Navigation & Paths
- `useInventorySubmodules.tsx` — "Picking Lists" added under Manage
- `path.ts` — all picking list paths added

---

## Ab Kya Baaki Hai (Future Phases)

| Phase | Feature |
|-------|---------|
| P1 | Job Staging — central warehouse se line-side shelf pe materials move karo |
| P2 | Movements Feed — factory-wide ek view mein sab movements |
| P3 | Incident Reporting — agar batch kharab hua toh PL auto-adjust ho |
| Future | Wave grouping, FEFO sorting, MES scan screen |

---

*Yeh POC hai — core flow kaam karta hai. Production mein jaane se pehle full form fields,
validation, error states, aur MES routes bhi banenge.*
