-- ============================================================
-- Picking Lists — Auto-generate on job.status → Planned / Ready
--
-- Idempotent: only fires when job.pickingStatus = 'Not Generated'.
-- Skipped when:
--   - companySettings.usePickingLists = false
--   - job.autoGeneratePickingList = false
--   - no jobMaterial qualifies (Pull from Inventory + qty > 0 + requiresPicking)
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_auto_generate_picking_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_use_picking_lists BOOLEAN;
  v_has_materials     BOOLEAN;
  v_pl_id             TEXT;
  v_readable_id       TEXT;
BEGIN
  -- Only react when transitioning INTO Planned or Ready
  IF NEW."status" NOT IN ('Planned', 'Ready') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = NEW."status" THEN
    RETURN NEW;
  END IF;

  -- Per-job opt-in
  IF COALESCE(NEW."autoGeneratePickingList", false) = false THEN
    RETURN NEW;
  END IF;

  -- Idempotent guard: only generate once
  IF NEW."pickingStatus" IS DISTINCT FROM 'Not Generated' THEN
    RETURN NEW;
  END IF;

  -- locationId is required for a PL
  IF NEW."locationId" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Company-wide opt-in
  SELECT COALESCE("usePickingLists", true)
  INTO v_use_picking_lists
  FROM "companySettings"
  WHERE id = NEW."companyId";

  IF NOT COALESCE(v_use_picking_lists, true) THEN
    RETURN NEW;
  END IF;

  -- At least one qualifying material must exist
  SELECT EXISTS (
    SELECT 1 FROM "jobMaterial"
    WHERE "jobId" = NEW.id
      AND "companyId" = NEW."companyId"
      AND "methodType" = 'Pull from Inventory'
      AND "quantityToIssue" > 0
      AND "requiresPicking" = true
  ) INTO v_has_materials;

  IF NOT v_has_materials THEN
    RETURN NEW;
  END IF;

  -- All guards passed → create the PL header + lines.
  -- Header insert + line generation mirror the edge function path.
  v_readable_id := get_next_sequence('pickingList', NEW."companyId");

  INSERT INTO "pickingList" (
    "pickingListId",
    "jobId",
    "locationId",
    "status",
    "companyId",
    "createdBy"
  ) VALUES (
    v_readable_id,
    NEW.id,
    NEW."locationId",
    'Draft',
    NEW."companyId",
    COALESCE(NEW."updatedBy", NEW."createdBy", 'system')
  ) RETURNING id INTO v_pl_id;

  PERFORM generate_picking_list_lines(
    v_pl_id,
    NEW.id,
    NEW."companyId",
    COALESCE(NEW."updatedBy", NEW."createdBy", 'system')
  );

  -- pickingList INSERT trigger will recompute pickingStatus → 'Generated'.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "job_auto_generate_picking_list" ON "job";
CREATE TRIGGER "job_auto_generate_picking_list"
AFTER UPDATE OF "status" ON "job"
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_picking_list();
