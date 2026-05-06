-- ============================================================
-- Picking Lists — RPC uplift
-- Improves generate_picking_list_lines:
--   1. Applies pickMethod.defaultStorageUnitId preference per item/location
--   2. Falls back to jobMaterial.storageUnitId when no pickMethod exists
-- ============================================================

CREATE OR REPLACE FUNCTION generate_picking_list_lines(
  p_picking_list_id TEXT,
  p_job_id          TEXT,
  p_company_id      TEXT,
  p_user_id         TEXT
)
RETURNS SETOF "pickingListLine"
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pl  "pickingList"%ROWTYPE;
BEGIN
  SELECT * INTO v_pl
  FROM "pickingList"
  WHERE id = p_picking_list_id AND "companyId" = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking list % not found', p_picking_list_id;
  END IF;

  -- Delete existing lines (idempotent for regeneration)
  DELETE FROM "pickingListLine"
  WHERE "pickingListId" = p_picking_list_id AND "companyId" = p_company_id;

  -- Insert one line per qualifying jobMaterial.
  -- Shelf preference: pickMethod.defaultStorageUnitId > jobMaterial.storageUnitId
  INSERT INTO "pickingListLine" (
    "pickingListId",
    "jobMaterialId",
    "itemId",
    "storageUnitId",
    "destinationStorageUnitId",
    "estimatedQuantity",
    "requiresBatchTracking",
    "requiresSerialTracking",
    "unitOfMeasureCode",
    "companyId",
    "createdBy"
  )
  SELECT
    p_picking_list_id,
    jm.id,
    jm."itemId",
    COALESCE(pm."defaultStorageUnitId", jm."storageUnitId"),
    COALESCE(wc."defaultStorageUnitId", v_pl."destinationStorageUnitId"),
    jm."quantityToIssue",
    COALESCE(i."itemTrackingType" = 'Batch', false),
    COALESCE(i."itemTrackingType" = 'Serial', false),
    jm."unitOfMeasureCode",
    p_company_id,
    p_user_id
  FROM "jobMaterial" jm
  JOIN "item" i ON i.id = jm."itemId"
  LEFT JOIN "jobOperation" jo ON jo.id = jm."jobOperationId"
  LEFT JOIN "workCenter" wc ON wc.id = jo."workCenterId"
  LEFT JOIN "pickMethod" pm
    ON pm."itemId" = jm."itemId"
   AND pm."locationId" = v_pl."locationId"
   AND pm."companyId" = p_company_id
  WHERE jm."jobId" = p_job_id
    AND jm."companyId" = p_company_id
    AND jm."methodType" = 'Pull from Inventory'
    AND jm."quantityToIssue" > 0
    AND jm."requiresPicking" = true;

  RETURN QUERY
  SELECT * FROM "pickingListLine"
  WHERE "pickingListId" = p_picking_list_id AND "companyId" = p_company_id;
END;
$$;
