import type { Result } from "@carbon/auth";
import { success, useCarbon } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
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
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});

  const { id, lineId } = params;
  if (!id || !lineId) throw new Error("id and lineId required");

  const payload = await request.json();
  const { trackedEntityId, pickedQuantity = 1 } = payload;

  if (!trackedEntityId) {
    return data({
      success: false,
      message: "Tracked entity ID required"
    });
  }

  const serviceRole = await getCarbonServiceRole();
  const { error: fnError } = await serviceRole.functions.invoke("pick", {
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
      // best-effort
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
  if (!id || !lineId) throw new Error("id and lineId required");

  const { carbon } = useCarbon();
  const { t } = useLingui();
  const navigate = useNavigate();
  const fetcher = useFetcher<Result>();

  const [serialNumber, setSerialNumber] = useState("");
  const [pickedQuantity, setPickedQuantity] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatedEntity, setValidatedEntity] = useState<{
    id: string;
    quantity: number;
  } | null>(null);

  const onClose = () => navigate(path.to.pickingList(id));

  useEffect(() => {
    if (fetcher.data?.success === false) {
      toast.error((fetcher.data as any).message);
    }
  }, [fetcher.data]);

  const validateEntity = async (input: string) => {
    if (!input.trim()) {
      setValidationError(null);
      setValidatedEntity(null);
      return;
    }

    setIsLoading(true);
    setValidationError(null);

    try {
      const { data: rows } = (await carbon
        ?.from("trackedEntity")
        .select("*")
        .or(`id.eq.${input},readableId.eq.${input}`)
        .limit(1)) ?? { data: null };

      const result = { data: rows?.[0] ?? null };

      if (!result.data) {
        setValidationError(t`Tracked entity not found`);
        setValidatedEntity(null);
        return;
      }
      if (result.data.status !== "Available") {
        setValidationError(t`Entity is ${result.data.status}`);
        setValidatedEntity(null);
        return;
      }

      const entityQuantity = Number(result.data.quantity ?? 0);
      setValidatedEntity({
        id: result.data.id,
        quantity: entityQuantity
      });
      setPickedQuantity(String(entityQuantity > 0 ? entityQuantity : 1));
    } catch {
      setValidationError(t`Error validating entity`);
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

    fetcher.submit(
      { trackedEntityId: validatedEntity.id, pickedQuantity: qty },
      { method: "POST", encType: "application/json" }
    );
  };

  const isValid = validatedEntity !== null;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>
            <Trans>Scan tracking ID</Trans>
          </ModalTitle>
          <ModalDescription>
            <Trans>
              Scan the serial or batch ID, then confirm the picked quantity.
            </Trans>
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

          {validatedEntity && (
            <div className="flex items-center gap-2">
              <Input
                value={pickedQuantity}
                type="number"
                min={0}
                step="any"
                onChange={(e) => setPickedQuantity(e.target.value)}
                className="text-right"
              />
              <span className="text-xs text-muted-foreground">
                / {validatedEntity.quantity}
              </span>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            leftIcon={<LuCircleCheck />}
            isLoading={fetcher.state !== "idle"}
            isDisabled={!isValid || fetcher.state !== "idle"}
            onClick={pickValidatedEntity}
          >
            <Trans>Pick</Trans>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
