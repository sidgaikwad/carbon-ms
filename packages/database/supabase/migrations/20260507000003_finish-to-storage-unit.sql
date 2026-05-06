-- ============================================================
-- Finish-to storage unit (P1 — Job Staging)
--
-- makeMethod.finishToStorageUnitId: master-data default for where
--   completed make-to-stock output should land.
-- job.finishToStorageUnitId: per-job override, copied from the linked
--   makeMethod at job creation (see upsertJobMakeMethodFromJob).
-- Both are ON DELETE SET NULL — deleting a storage unit must not
-- cascade-delete jobs/methods.
-- ============================================================

ALTER TABLE "makeMethod"
  ADD COLUMN IF NOT EXISTS "finishToStorageUnitId" TEXT
    REFERENCES "storageUnit"("id") ON DELETE SET NULL;

ALTER TABLE "job"
  ADD COLUMN IF NOT EXISTS "finishToStorageUnitId" TEXT
    REFERENCES "storageUnit"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_make_method_finish_to_storage_unit
  ON "makeMethod" ("finishToStorageUnitId")
  WHERE "finishToStorageUnitId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_finish_to_storage_unit
  ON "job" ("finishToStorageUnitId")
  WHERE "finishToStorageUnitId" IS NOT NULL;

-- ─── Propagation: makeMethod.finishToStorageUnitId → job ────────
--
-- When the top-level jobMakeMethod (parentMaterialId IS NULL) is inserted
-- for a job, copy the active makeMethod.finishToStorageUnitId to job.
-- Only writes when the job currently has no override (NULL) — so a
-- planner who already set job.finishToStorageUnitId by hand isn't
-- overwritten by a later regeneration.
-- jobMakeMethod has no direct makeMethodId; the link is via itemId
-- to the active make method (activeMakeMethods view).

CREATE OR REPLACE FUNCTION trigger_propagate_finish_to_storage_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_finish_to TEXT;
BEGIN
  IF NEW."parentMaterialId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT amm."finishToStorageUnitId"
  INTO v_finish_to
  FROM "activeMakeMethods" amm
  WHERE amm."itemId" = NEW."itemId"
    AND amm."companyId" = NEW."companyId"
  LIMIT 1;

  IF v_finish_to IS NOT NULL THEN
    UPDATE "job"
    SET "finishToStorageUnitId" = v_finish_to
    WHERE id = NEW."jobId"
      AND "companyId" = NEW."companyId"
      AND "finishToStorageUnitId" IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "jobMakeMethod_propagate_finish_to" ON "jobMakeMethod";
CREATE TRIGGER "jobMakeMethod_propagate_finish_to"
AFTER INSERT ON "jobMakeMethod"
FOR EACH ROW
EXECUTE FUNCTION trigger_propagate_finish_to_storage_unit();
