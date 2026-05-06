import type { Result } from "@carbon/auth";
import { success, useCarbon } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import {
  Alert,
  AlertTitle,
  Button,
  cn,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  toast
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import {
  LuCheck,
  LuCircleCheck,
  LuQrCode,
  LuTriangleAlert,
  LuX
} from "react-icons/lu";
import type { ActionFunctionArgs } from "react-router";
import {
  data,
  redirect,
  useFetcher,
  useNavigate,
  useParams
} from "react-router";
import { useRouteData } from "~/hooks";
import type { PickingListDetail, PickingListLine } from "~/modules/inventory";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { id, lineId } = params;
  if (!id || !lineId) throw new Error("id and lineId are required");

  const payload = await request.json();
  const { trackedEntityId, pickedQuantity = 1 } = payload;

  if (!trackedEntityId) {
    return data({ success: false, message: "Tracked entity ID is required" });
  }

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({
      type: "pickTrackedEntityLine",
      pickingListId: id,
      pickingListLineId: lineId,
      trackedEntityId,
      pickedQuantity,
      companyId,
      userId
    })
  });

  if (fnError) {
    let message = "Failed to pick line";
    try {
      const body = await (fnError as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // Best effort parse of edge-function error payload.
    }
    return data({ success: false, message });
  }

  throw redirect(
    path.to.pickingList(id),
    await flash(request, success("Entity scanned and picked"))
  );
}

export default function PickingListScanRoute() {
  const { id, lineId } = useParams();
  if (!id || !lineId) throw new Error("id and lineId are required");

  const routeData = useRouteData<{
    pickingList: PickingListDetail;
    pickingListLines: PickingListLine[];
  }>(path.to.pickingList(id));

  const line = routeData?.pickingListLines.find((l) => l.id === lineId);
  if (!line) throw new Error("Line not found");

  const { carbon } = useCarbon();
  const { t } = useLingui();
  const navigate = useNavigate();
  const fetcher = useFetcher<Result>();

  const [serialNumber, setSerialNumber] = useState("");
  const [pickedQuantity, setPickedQuantity] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [validatedEntity, setValidatedEntity] = useState<{
    id: string;
    quantity: number;
  } | null>(null);

  const onClose = () => navigate(path.to.pickingList(id));

  useEffect(() => {
    if (fetcher.data?.success === false) {
      toast.error(fetcher.data.message);
    }
  }, [fetcher.data]);

  const validateEntity = async (input: string) => {
    if (!input.trim()) {
      setValidationError(null);
      setIsValid(null);
      setValidatedEntity(null);
      return;
    }

    setIsLoading(true);
    setValidationError(null);
    setIsValid(null);

    try {
      // Accept either internal id or human-readable serial/batch number
      const { data: rows } = (await carbon
        ?.from("trackedEntity")
        .select("*")
        .or(`id.eq.${input},readableId.eq.${input}`)
        .limit(1)) ?? { data: null };

      const result = { data: rows?.[0] ?? null };

      if (!result?.data) {
        setValidationError(t`Tracked entity not found`);
        setIsValid(false);
        setValidatedEntity(null);
        return;
      }

      if (result.data.status !== "Available") {
        setValidationError(t`Entity is ${result.data.status}`);
        setIsValid(false);
        setValidatedEntity(null);
        return;
      }

      if (result.data.sourceDocumentId !== (line as any).itemId) {
        setValidationError(
          t`Wrong item - expected ${(line as any).item?.readableId}`
        );
        setIsValid(false);
        setValidatedEntity(null);
        return;
      }

      const entityQuantity = Number(result.data.quantity ?? 0);
      const outstanding = Number((line as any).outstandingQuantity ?? 0);
      const defaultQty =
        outstanding > 0
          ? Math.min(entityQuantity, outstanding)
          : entityQuantity;

      setValidatedEntity({
        id: result.data.id,
        quantity: entityQuantity
      });
      setPickedQuantity(String(defaultQty > 0 ? defaultQty : 1));
      setIsValid(true);
    } catch {
      setValidationError(t`Error validating entity`);
      setIsValid(false);
      setValidatedEntity(null);
    } finally {
      setIsLoading(false);
    }
  };

  const pickValidatedEntity = () => {
    if (!validatedEntity) {
      setValidationError(t`Scan and validate an entity first`);
      return;
    }

    const qty = Number(pickedQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setValidationError(t`Picked quantity must be greater than 0`);
      return;
    }

    if (qty > validatedEntity.quantity) {
      setValidationError(t`Picked quantity cannot exceed entity quantity`);
      return;
    }

    setValidationError(null);
    fetcher.submit(
      { trackedEntityId: validatedEntity.id, pickedQuantity: qty },
      { method: "POST", encType: "application/json" }
    );
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{(line as any).item?.readableId}</ModalTitle>
          <ModalDescription>
            <Trans>Scan the tracking ID for this line</Trans>
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {validationError && (
            <Alert variant="destructive">
              <LuTriangleAlert className="h-4 w-4" />
              <AlertTitle>{validationError}</AlertTitle>
            </Alert>
          )}
          <InputGroup>
            <Input
              value={serialNumber}
              onChange={(e) => {
                setSerialNumber(e.target.value);
                setValidationError(null);
                setIsValid(null);
                setValidatedEntity(null);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && validateEntity(serialNumber)
              }
              onBlur={() => validateEntity(serialNumber)}
              autoFocus
              placeholder={t`Enter or scan entity ID`}
              className={cn(
                validationError && "border-destructive",
                isValid && "border-emerald-500"
              )}
              disabled={isLoading || fetcher.state !== "idle"}
            />
            <InputRightElement className="pl-2">
              {isLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
              ) : validationError ? (
                <LuX className="text-destructive" />
              ) : isValid ? (
                <LuCheck className="text-emerald-500" />
              ) : (
                <LuQrCode />
              )}
            </InputRightElement>
          </InputGroup>

          <InputGroup>
            <Input
              type="number"
              min={0}
              step="any"
              value={pickedQuantity}
              onChange={(e) => {
                setPickedQuantity(e.target.value);
                setValidationError(null);
              }}
              placeholder={t`Picked quantity`}
              disabled={
                !validatedEntity || isLoading || fetcher.state !== "idle"
              }
            />
            <InputRightElement>
              {validatedEntity ? (
                <span className="text-xs text-muted-foreground">
                  / {validatedEntity.quantity}
                </span>
              ) : null}
            </InputRightElement>
          </InputGroup>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            leftIcon={<LuCircleCheck />}
            isLoading={fetcher.state !== "idle"}
            isDisabled={!validatedEntity || fetcher.state !== "idle"}
            onClick={pickValidatedEntity}
          >
            <Trans>Pick</Trans>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
