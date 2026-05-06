-- ============================================================
-- Picking Lists — multi-shelf allocation in generate_picking_list_lines
--
-- Walks shelves at job.locationId by available qty DESC (preferred shelf
-- from pickMethod / jobMaterial.storageUnitId comes first). Creates one
-- pickingListLine per contributing shelf. If aggregate stock < required
-- after walking all shelves, a final shortage line is appended at the
-- preferred shelf so the operator sees the outstanding qty immediately.
--
-- Destination resolution per line:
--   COALESCE(workCenter.defaultStorageUnitId,
--            pickingList.destinationStorageUnitId,
--            NULL)
--
-- Available = SUM(itemLedger.quantity) at the shelf, excluding tracked
-- ledger rows whose trackedEntityStatus is NOT 'Available'.
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
  v_pl              "pickingList"%ROWTYPE;
  v_jm              RECORD;
  v_shelf           RECORD;
  v_remaining       NUMERIC;
  v_alloc           NUMERIC;
  v_destination     TEXT;
  v_preferred_shelf TEXT;
  v_requires_batch  BOOLEAN;
  v_requires_serial BOOLEAN;
BEGIN
  SELECT * INTO v_pl
  FROM "pickingList"
  WHERE id = p_picking_list_id AND "companyId" = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking list % not found', p_picking_list_id;
  END IF;

  -- Idempotent regeneration
  DELETE FROM "pickingListLine"
  WHERE "pickingListId" = p_picking_list_id AND "companyId" = p_company_id;

  FOR v_jm IN
    SELECT
      jm.id,
      jm."itemId",
      jm."storageUnitId",
      jm."quantityToIssue",
      jm."unitOfMeasureCode",
      jm."jobOperationId",
      i."itemTrackingType",
      pm."defaultStorageUnitId" AS "pickMethodShelf",
      wc."defaultStorageUnitId" AS "workCenterShelf"
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
      AND jm."requiresPicking" = true
  LOOP
    v_remaining       := v_jm."quantityToIssue";
    v_preferred_shelf := COALESCE(v_jm."pickMethodShelf", v_jm."storageUnitId");
    v_destination     := COALESCE(v_jm."workCenterShelf", v_pl."destinationStorageUnitId");
    v_requires_batch  := v_jm."itemTrackingType" = 'Batch';
    v_requires_serial := v_jm."itemTrackingType" = 'Serial';

    -- Walk shelves: preferred first (if it has any stock), then by available qty DESC.
    -- Shelves with zero/negative aggregate are excluded.
    FOR v_shelf IN
      WITH shelf_balance AS (
        SELECT
          il."storageUnitId",
          SUM(il.quantity) FILTER (
            WHERE il."trackedEntityId" IS NULL
               OR il."trackedEntityStatus" = 'Available'
          ) AS available
        FROM "itemLedger" il
        WHERE il."itemId" = v_jm."itemId"
          AND il."locationId" = v_pl."locationId"
          AND il."companyId" = p_company_id
          AND il."storageUnitId" IS NOT NULL
        GROUP BY il."storageUnitId"
      )
      SELECT
        sb."storageUnitId",
        sb.available
      FROM shelf_balance sb
      WHERE sb.available > 0
      ORDER BY
        CASE WHEN sb."storageUnitId" = v_preferred_shelf THEN 0 ELSE 1 END ASC,
        sb.available DESC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_alloc     := LEAST(v_shelf.available, v_remaining);
      v_remaining := v_remaining - v_alloc;

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
      ) VALUES (
        p_picking_list_id,
        v_jm.id,
        v_jm."itemId",
        v_shelf."storageUnitId",
        v_destination,
        v_alloc,
        v_requires_batch,
        v_requires_serial,
        v_jm."unitOfMeasureCode",
        p_company_id,
        p_user_id
      );
    END LOOP;

    -- Shortage: if aggregate inventory at this location can't cover the
    -- requirement, append a final line at the preferred shelf with the
    -- remainder so the operator sees outstandingQuantity > 0 right away.
    IF v_remaining > 0 THEN
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
      ) VALUES (
        p_picking_list_id,
        v_jm.id,
        v_jm."itemId",
        v_preferred_shelf,
        v_destination,
        v_remaining,
        v_requires_batch,
        v_requires_serial,
        v_jm."unitOfMeasureCode",
        p_company_id,
        p_user_id
      );
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT * FROM "pickingListLine"
  WHERE "pickingListId" = p_picking_list_id AND "companyId" = p_company_id;
END;
$$;
