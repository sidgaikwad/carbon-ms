-- Allow manually-added picking list lines that have no corresponding jobMaterial.
-- jobMaterialId is still populated for BOM-generated lines; null means manual line.
ALTER TABLE "pickingListLine" ALTER COLUMN "jobMaterialId" DROP NOT NULL;
