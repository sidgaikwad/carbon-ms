import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import {
  Badge,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  SidebarTrigger,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import {
  LuArrowLeft,
  LuCheck,
  LuCircleCheck,
  LuPackage,
  LuQrCode,
  LuUndo2,
  LuWarehouse
} from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  useParams
} from "react-router";
import { getPickingListForOperator } from "~/services/inventory.service";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {});

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const result = await getPickingListForOperator(client, id, companyId);

  if (result.error || !result.data) {
    throw redirect(
      path.to.pickingLists,
      await flash(request, error(result.error, "Picking list not found"))
    );
  }

  return result.data;
}

export default function PickingListPickRoute() {
  const { t } = useLingui();
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const { pickingList, lines } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const pickFetcher = useFetcher();

  const isEditable = ["Released", "In Progress"].includes(
    (pickingList as any).status
  );
  const pickedCount = lines.filter(
    (l: any) => (l.pickedQuantity ?? 0) > 0
  ).length;
  const allPicked = pickedCount === lines.length && lines.length > 0;

  const onPickQty = (line: any, qty: number) => {
    pickFetcher.submit(
      { pickingListLineId: line.id, pickedQuantity: String(qty) },
      { method: "post", action: path.to.pickingListPick(id) }
    );
  };

  const onScan = (line: any) => {
    navigate(path.to.pickingListScan(id, line.id));
  };

  const onConfirm = () => {
    navigate(path.to.pickingListConfirm(id));
  };

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b bg-background">
        <div className="flex items-center gap-2 px-2 flex-1">
          <SidebarTrigger />
          <IconButton
            aria-label={t`Back`}
            variant="ghost"
            icon={<LuArrowLeft />}
            asChild
          >
            <Link to={path.to.pickingLists} />
          </IconButton>
          <Heading size="h4">{(pickingList as any).pickingListId}</Heading>
          <Badge variant="outline">{(pickingList as any).status}</Badge>
        </div>
        {isEditable && (
          <div className="px-2">
            <Button
              size="sm"
              isDisabled={!allPicked}
              leftIcon={<LuCircleCheck />}
              onClick={onConfirm}
            >
              <Trans>Confirm</Trans>
            </Button>
          </div>
        )}
      </header>

      <main className="h-[calc(100dvh-var(--header-height))] w-full overflow-y-auto">
        <div className="p-4 border-b">
          <span className="text-xs text-muted-foreground">
            {pickedCount}/{lines.length} <Trans>lines picked</Trans>
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <LuPackage className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs uppercase font-mono text-muted-foreground">
              <Trans>This picking list has no lines</Trans>
            </span>
          </div>
        ) : (
          <VStack spacing={0}>
            {lines.map((line: any) => (
              <PickRow
                key={line.id}
                line={line}
                isEditable={isEditable}
                onPickQty={onPickQty}
                onScan={onScan}
              />
            ))}
          </VStack>
        )}
      </main>

      <Outlet />
    </div>
  );
}

function PickRow({
  line,
  isEditable,
  onPickQty,
  onScan
}: {
  line: any;
  isEditable: boolean;
  onPickQty: (line: any, qty: number) => void;
  onScan: (line: any) => void;
}) {
  const isTracked = line.requiresBatchTracking || line.requiresSerialTracking;
  const isPicked = (line.pickedQuantity ?? 0) > 0;
  const required = line.adjustedQuantity ?? line.estimatedQuantity ?? 0;
  const [qty, setQty] = useState(String(line.pickedQuantity ?? 0));

  return (
    <div className="flex flex-col gap-3 p-4 border-b">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-medium">{line.item?.name}</span>
          <span className="text-xs text-muted-foreground">
            {line.item?.readableId}
          </span>
          {line.storageUnit && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <LuWarehouse className="h-3 w-3" />
              {line.storageUnit.name}
            </span>
          )}
          <HStack spacing={1} className="mt-1 flex-wrap">
            {line.requiresBatchTracking && (
              <Badge variant="outline" className="text-xs">
                Batch
              </Badge>
            )}
            {line.requiresSerialTracking && (
              <Badge variant="outline" className="text-xs">
                Serial
              </Badge>
            )}
          </HStack>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs text-muted-foreground">
            <Trans>Required</Trans>
          </div>
          <div className="text-lg font-semibold">
            {required} {line.unitOfMeasureCode}
          </div>
        </div>

        {isPicked && (
          <LuCircleCheck className="text-green-500 h-5 w-5 shrink-0 mt-1" />
        )}
      </div>

      {isEditable && (
        <div className="flex items-center gap-2">
          {isTracked ? (
            <Button
              variant={line.pickedTrackedEntityId ? "secondary" : "primary"}
              size="lg"
              leftIcon={<LuQrCode />}
              onClick={() => onScan(line)}
              className="flex-1"
            >
              {line.pickedTrackedEntityId ? (
                <Trans>Re-scan</Trans>
              ) : (
                <Trans>Scan</Trans>
              )}
            </Button>
          ) : (
            <>
              <Input
                value={qty}
                type="number"
                min={0}
                step="any"
                onChange={(e) => setQty(e.target.value)}
                className="text-right text-lg flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {line.unitOfMeasureCode}
              </span>
              <Button
                size="lg"
                leftIcon={<LuCheck />}
                onClick={() => {
                  const n = parseFloat(qty);
                  if (!isNaN(n)) onPickQty(line, n);
                }}
              >
                <Trans>Pick</Trans>
              </Button>
              {isPicked && (
                <IconButton
                  aria-label="Unpick"
                  icon={<LuUndo2 />}
                  variant="ghost"
                  onClick={() => onPickQty(line, 0)}
                />
              )}
            </>
          )}
        </div>
      )}

      {(line.outstandingQuantity ?? 0) > 0 && (
        <div className="text-xs text-orange-500">
          <Trans>Outstanding:</Trans> {line.outstandingQuantity}{" "}
          {line.unitOfMeasureCode}
        </div>
      )}
    </div>
  );
}
