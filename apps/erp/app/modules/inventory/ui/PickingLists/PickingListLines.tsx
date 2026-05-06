import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  HStack,
  IconButton,
  Input,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuCircleCheck, LuQrCode, LuUndo2, LuWarehouse } from "react-icons/lu";
import { useFetcher, useNavigate, useParams } from "react-router";
import { Empty, ItemThumbnail } from "~/components";
import { usePermissions, useRouteData } from "~/hooks";
import type { PickingListDetail, PickingListLine } from "~/modules/inventory";
import { path } from "~/utils/path";

interface PickingListLineRowProps {
  line: PickingListLine;
  isEditable: boolean;
  onPick: (line: PickingListLine, qty: number) => void;
  onUnpick: (line: PickingListLine) => void;
  onScan: (line: PickingListLine) => void;
}

function PickingListLineRow({
  line,
  isEditable,
  onPick,
  onUnpick,
  onScan
}: PickingListLineRowProps) {
  const [qty, setQty] = useState<string>(String(line.pickedQuantity ?? 0));
  const item = (line as any).item;
  const storageUnit = (line as any).storageUnit;
  const isTracked = line.requiresBatchTracking || line.requiresSerialTracking;
  const isPicked = (line.pickedQuantity ?? 0) > 0;

  return (
    <div
      className={cn(
        "flex flex-col border-b p-4 gap-3 last:border-none",
        isPicked && "bg-muted/30"
      )}
    >
      <div className="flex justify-between items-start">
        <HStack spacing={3} className="flex-1">
          <ItemThumbnail
            size="md"
            thumbnailPath={item?.thumbnailPath}
            type={(item?.type as "Part") ?? "Part"}
          />
          <VStack spacing={0}>
            <span className="text-sm font-medium">{item?.name}</span>
            <span className="text-xs text-muted-foreground">
              {item?.readableId}
            </span>
            {storageUnit && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <LuWarehouse className="h-3 w-3" />
                {storageUnit.name}
              </span>
            )}
            {line.requiresBatchTracking && (
              <Badge variant="outline" className="text-xs w-fit mt-0.5">
                Batch
              </Badge>
            )}
            {line.requiresSerialTracking && (
              <Badge variant="outline" className="text-xs w-fit mt-0.5">
                Serial
              </Badge>
            )}
          </VStack>
        </HStack>

        <HStack spacing={2} className="items-center">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              <Trans>Required</Trans>
            </div>
            <div
              className={cn(
                "text-sm font-medium",
                line.adjustedQuantity != null &&
                  "line-through text-muted-foreground"
              )}
            >
              {line.estimatedQuantity} {line.unitOfMeasureCode}
            </div>
            {line.adjustedQuantity != null && (
              <div className="text-sm font-medium text-orange-500">
                {line.adjustedQuantity} {line.unitOfMeasureCode}
              </div>
            )}
          </div>

          {isEditable && (
            <div className="flex items-center gap-1">
              {isTracked ? (
                <Button
                  size="sm"
                  variant={line.pickedTrackedEntityId ? "secondary" : "primary"}
                  leftIcon={<LuQrCode />}
                  onClick={() => onScan(line)}
                >
                  {line.pickedTrackedEntityId ? (
                    <Trans>Re-scan</Trans>
                  ) : (
                    <Trans>Scan</Trans>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-20 text-right"
                    type="number"
                    min={0}
                    step="any"
                    onBlur={() => {
                      const n = parseFloat(qty);
                      if (!isNaN(n) && n !== line.pickedQuantity) {
                        onPick(line, n);
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {line.unitOfMeasureCode}
                  </span>
                </div>
              )}

              {isPicked && (
                <IconButton
                  aria-label="Unpick"
                  icon={<LuUndo2 />}
                  variant="ghost"
                  size="sm"
                  onClick={() => onUnpick(line)}
                />
              )}
            </div>
          )}

          {!isEditable && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                <Trans>Picked</Trans>
              </div>
              <div
                className={cn(
                  "text-sm font-medium",
                  isPicked ? "text-green-600" : "text-muted-foreground"
                )}
              >
                {line.pickedQuantity ?? 0} {line.unitOfMeasureCode}
              </div>
            </div>
          )}

          {isPicked && (
            <LuCircleCheck className="text-green-500 h-4 w-4 flex-shrink-0" />
          )}
        </HStack>
      </div>

      {line.pickedTrackedEntityId && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-12">
          <LuQrCode className="h-3 w-3" />
          {line.pickedTrackedEntityId}
        </div>
      )}

      {(line.outstandingQuantity ?? 0) > 0 && (
        <div className="ml-12 text-xs text-orange-500">
          <Trans>Outstanding:</Trans> {line.outstandingQuantity}{" "}
          {line.unitOfMeasureCode}
        </div>
      )}
    </div>
  );
}

const PickingListLines = () => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const routeData = useRouteData<{
    pickingList: PickingListDetail;
    pickingListLines: PickingListLine[];
  }>(path.to.pickingList(id));

  const pl = routeData?.pickingList;
  const lines = routeData?.pickingListLines ?? [];

  const { t } = useLingui();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const pickFetcher = useFetcher();

  const isEditable =
    pl != null &&
    ["Released", "In Progress"].includes(pl.status) &&
    permissions.can("update", "inventory");

  const pickedCount = lines.filter((l) => (l.pickedQuantity ?? 0) > 0).length;

  const onPick = (line: PickingListLine, qty: number) => {
    pickFetcher.submit(
      {
        pickingListId: id,
        pickingListLineId: line.id!,
        pickedQuantity: qty
      },
      {
        method: "post",
        action: path.to.pickingListLineQuantity(id)
      }
    );
  };

  const onUnpick = (line: PickingListLine) => {
    pickFetcher.submit(
      {
        pickingListId: id,
        pickingListLineId: line.id!
      },
      {
        method: "post",
        action: path.to.unpickPickingListLine(id, line.id!)
      }
    );
  };

  const onScan = (line: PickingListLine) => {
    navigate(path.to.pickingListScan(id, line.id!));
  };

  return (
    <Card>
      <CardHeader>
        <HStack className="justify-between">
          <CardTitle>
            <Trans>Lines</Trans>
            {lines.length > 0 && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                {pickedCount}/{lines.length} <Trans>picked</Trans>
              </span>
            )}
          </CardTitle>
        </HStack>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 ? (
          <Empty className="py-6">
            <span className="text-xs text-muted-foreground">
              {t`This picking list has no lines yet.`}
            </span>
          </Empty>
        ) : (
          lines.map((line) => (
            <PickingListLineRow
              key={line.id}
              line={line}
              isEditable={isEditable}
              onPick={onPick}
              onUnpick={onUnpick}
              onScan={onScan}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default PickingListLines;
