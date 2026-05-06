-- ============================================================
-- Picking Lists — Over-pick tolerance hierarchy
--
-- Two-level resolution (most-specific wins):
--   item.overpickTolerancePercent
--   companySettings.defaultOverpickTolerancePercent (default 2.0)
--
-- Used by the client to show a soft warning when
--   picked > estimated * (1 + tolerance/100)
-- The 2× hard block in pickInventoryLine still applies server-side.
--
-- (itemGroup tier from the original plan was dropped — no itemGroup
-- table exists in this schema. Add it back here when one is introduced.)
-- ============================================================

ALTER TABLE "companySettings"
  ADD COLUMN IF NOT EXISTS "defaultOverpickTolerancePercent" NUMERIC NOT NULL DEFAULT 2.0;

ALTER TABLE "item"
  ADD COLUMN IF NOT EXISTS "overpickTolerancePercent" NUMERIC;

-- Helper: returns the effective tolerance percent for an item.
-- Always returns a number — falls back to 2.0 if no companySettings row exists.
CREATE OR REPLACE FUNCTION get_overpick_tolerance_percent(
  p_item_id    TEXT,
  p_company_id TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT i."overpickTolerancePercent" FROM "item" i
       WHERE i.id = p_item_id AND i."companyId" = p_company_id),
    (SELECT cs."defaultOverpickTolerancePercent" FROM "companySettings" cs
       WHERE cs.id = p_company_id),
    2.0
  );
$$;
