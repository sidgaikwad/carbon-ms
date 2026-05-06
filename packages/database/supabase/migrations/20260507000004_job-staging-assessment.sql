-- ============================================================
-- Job Staging — get_job_staging_assessment(jobId, companyId)
--
-- Per qualifying jobMaterial returns:
--   itemId, itemReadableId, itemName, unitOfMeasureCode
--   pickStorageUnitId / pickStorageUnitName (where the operator picks from)
--   estimatedQuantity (jobMaterial.quantityToIssue)
--   atPickLocation                (qty already at pickStorageUnit)
--   elsewhere                     (qty at OTHER shelves in the same location)
--   shortage                      (GREATEST(estimated − atPickLocation, 0))
--   sourceStorageUnitId/Name      (highest-qty alt shelf — the suggested
--                                   source for a stock transfer)
--   sourceStorageUnitQuantity     (qty at that source shelf)
--
-- Rows are returned for every Pull-from-Inventory material with
-- requiresPicking = true and quantityToIssue > 0. Materials that are
-- already covered (shortage = 0) still come back so the UI can show a
-- complete materials checklist, but with sourceStorageUnit fields NULL.
-- ============================================================

CREATE OR REPLACE FUNCTION get_job_staging_assessment(
  p_job_id     TEXT,
  p_company_id TEXT
)
RETURNS TABLE (
  "jobMaterialId"            TEXT,
  "itemId"                   TEXT,
  "itemReadableId"           TEXT,
  "itemName"                 TEXT,
  "unitOfMeasureCode"        TEXT,
  "pickStorageUnitId"        TEXT,
  "pickStorageUnitName"      TEXT,
  "estimatedQuantity"        NUMERIC,
  "atPickLocation"           NUMERIC,
  "elsewhere"                NUMERIC,
  "shortage"                 NUMERIC,
  "sourceStorageUnitId"      TEXT,
  "sourceStorageUnitName"    TEXT,
  "sourceStorageUnitQuantity" NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location_id TEXT;
BEGIN
  SELECT j."locationId" INTO v_location_id
  FROM "job" j
  WHERE j.id = p_job_id AND j."companyId" = p_company_id;

  IF v_location_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH job_materials AS (
    SELECT
      jm.id,
      jm."itemId",
      i."readableId" AS "itemReadableId",
      i."name" AS "itemName",
      jm."unitOfMeasureCode",
      jm."quantityToIssue" AS "estimatedQuantity",
      -- Preferred pick shelf: pickMethod.defaultStorageUnitId then jobMaterial.storageUnitId
      COALESCE(pm."defaultStorageUnitId", jm."storageUnitId") AS "pickStorageUnitId"
    FROM "jobMaterial" jm
    JOIN "item" i ON i.id = jm."itemId"
    LEFT JOIN "pickMethod" pm
      ON pm."itemId" = jm."itemId"
     AND pm."locationId" = v_location_id
     AND pm."companyId" = p_company_id
    WHERE jm."jobId" = p_job_id
      AND jm."companyId" = p_company_id
      AND jm."methodType" = 'Pull from Inventory'
      AND jm."quantityToIssue" > 0
      AND jm."requiresPicking" = true
  ),
  shelf_balance AS (
    SELECT
      il."itemId",
      il."storageUnitId",
      SUM(il.quantity) FILTER (
        WHERE il."trackedEntityId" IS NULL
           OR il."trackedEntityStatus" = 'Available'
      ) AS "available"
    FROM "itemLedger" il
    WHERE il."companyId" = p_company_id
      AND il."locationId" = v_location_id
      AND il."storageUnitId" IS NOT NULL
      AND il."itemId" IN (SELECT "itemId" FROM job_materials)
    GROUP BY il."itemId", il."storageUnitId"
  ),
  at_pick AS (
    SELECT
      jm.id AS "jobMaterialId",
      COALESCE(sb.available, 0) AS qty
    FROM job_materials jm
    LEFT JOIN shelf_balance sb
      ON sb."itemId" = jm."itemId"
     AND sb."storageUnitId" = jm."pickStorageUnitId"
  ),
  elsewhere_total AS (
    SELECT
      jm.id AS "jobMaterialId",
      COALESCE(SUM(sb.available), 0) AS qty
    FROM job_materials jm
    LEFT JOIN shelf_balance sb
      ON sb."itemId" = jm."itemId"
     AND (
       sb."storageUnitId" IS DISTINCT FROM jm."pickStorageUnitId"
     )
    WHERE sb.available > 0
    GROUP BY jm.id
  ),
  best_alt AS (
    SELECT DISTINCT ON (jm.id)
      jm.id AS "jobMaterialId",
      sb."storageUnitId" AS "sourceStorageUnitId",
      sb.available AS "sourceStorageUnitQuantity"
    FROM job_materials jm
    JOIN shelf_balance sb
      ON sb."itemId" = jm."itemId"
     AND (sb."storageUnitId" IS DISTINCT FROM jm."pickStorageUnitId")
    WHERE sb.available > 0
    ORDER BY jm.id, sb.available DESC
  )
  SELECT
    jm.id AS "jobMaterialId",
    jm."itemId",
    jm."itemReadableId",
    jm."itemName",
    jm."unitOfMeasureCode",
    jm."pickStorageUnitId",
    pick_su."name" AS "pickStorageUnitName",
    jm."estimatedQuantity",
    COALESCE(ap.qty, 0) AS "atPickLocation",
    COALESCE(et.qty, 0) AS "elsewhere",
    GREATEST(jm."estimatedQuantity" - COALESCE(ap.qty, 0), 0) AS "shortage",
    CASE WHEN GREATEST(jm."estimatedQuantity" - COALESCE(ap.qty, 0), 0) > 0
         THEN ba."sourceStorageUnitId"
         ELSE NULL END AS "sourceStorageUnitId",
    CASE WHEN GREATEST(jm."estimatedQuantity" - COALESCE(ap.qty, 0), 0) > 0
         THEN src_su."name"
         ELSE NULL END AS "sourceStorageUnitName",
    CASE WHEN GREATEST(jm."estimatedQuantity" - COALESCE(ap.qty, 0), 0) > 0
         THEN ba."sourceStorageUnitQuantity"
         ELSE NULL END AS "sourceStorageUnitQuantity"
  FROM job_materials jm
  LEFT JOIN at_pick ap         ON ap."jobMaterialId" = jm.id
  LEFT JOIN elsewhere_total et ON et."jobMaterialId" = jm.id
  LEFT JOIN best_alt ba        ON ba."jobMaterialId" = jm.id
  LEFT JOIN "storageUnit" pick_su ON pick_su.id = jm."pickStorageUnitId"
  LEFT JOIN "storageUnit" src_su  ON src_su.id  = ba."sourceStorageUnitId"
  ORDER BY jm."itemReadableId" NULLS LAST;
END;
$$;
