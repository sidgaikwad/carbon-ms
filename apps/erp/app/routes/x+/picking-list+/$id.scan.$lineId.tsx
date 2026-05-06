import type { Result } from "@carbon/auth";
import { error, success, useCarbon } from "@carbon/auth";
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
    return data(
      { success: false, message: "Tracked entity ID is required" },
      await flash(request, error(null, "Tracked entity ID is required"))
    );
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
    return data(
      { success: false, message: fnError.message ?? "Failed to pick line" },
      await flash(request, error(fnError.message, "Failed to pick line"))
    );
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
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const onClose = () => navigate(path.to.pickingList(id));

  useEffect(() => {
    if (fetcher.data?.success === false) {
      toast.error(fetcher.data.message);
    }
  }, [fetcher.data]);

  const validateAndPick = async (entityId: string) => {
    if (!entityId.trim()) {
      setValidationError(null);
      setIsValid(null);
      return;
    }

    setIsLoading(true);
    setValidationError(null);
    setIsValid(null);

    try {
      const result = await carbon
        ?.from("trackedEntity")
        .select("*")
        .eq("id", entityId)
        .single();

      if (!result?.data) {
        setValidationError(t`Tracked entity not found`);
        setIsValid(false);
        return;
      }

      if (result.data.status !== "Available") {
        setValidationError(t`Entity is ${result.data.status}`);
        setIsValid(false);
        return;
      }

      if (result.data.sourceDocumentId !== (line as any).itemId) {
        setValidationError(
          t`Wrong item — expected ${(line as any).item?.readableId}`
        );
        setIsValid(false);
        return;
      }

      setIsValid(true);
      fetcher.submit(
        { trackedEntityId: entityId, pickedQuantity: result.data.quantity },
        { method: "POST", encType: "application/json" }
      );
    } catch {
      setValidationError(t`Error validating entity`);
      setIsValid(false);
    } finally {
      setIsLoading(false);
    }
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
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && validateAndPick(serialNumber)
              }
              onBlur={() => validateAndPick(serialNumber)}
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
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            leftIcon={<LuCircleCheck />}
            isLoading={fetcher.state !== "idle"}
            isDisabled={fetcher.state !== "idle"}
            onClick={() => validateAndPick(serialNumber)}
          >
            <Trans>Pick</Trans>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
