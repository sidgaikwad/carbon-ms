import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import {
  Alert,
  AlertTitle,
  Button,
  FormControl,
  FormLabel,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
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
      path.to.pickingList(id),
      await flash(request, error(result.error, "Picking list not found"))
    );
  }

  return result.data;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const formData = await request.formData();
  const shortageReason =
    (formData.get("shortageReason") as string) || undefined;

  const serviceRole = await getCarbonServiceRole();
  const { error: fnError } = await serviceRole.functions.invoke("pick", {
    body: JSON.stringify({
      type: "confirmPickingList",
      pickingListId: id,
      shortageReason,
      companyId,
      userId
    })
  });

  if (fnError) {
    let message = "Failed to confirm picking list";
    try {
      const body = await (fnError as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // best-effort
    }
    return data({ success: false, message });
  }

  return data(
    { success: true },
    await flash(request, success("Picking list confirmed"))
  );
}

export default function PickingListConfirmRoute() {
  const { t } = useLingui();
  const { id } = useParams();
  if (!id) throw new Error("id required");

  const { lines } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ success: boolean; message?: string }>();
  const [shortageReason, setShortageReason] = useState("");
  const [backendError, setBackendError] = useState<string | null>(null);

  const hasOutstanding = lines.some(
    (l: any) => (l.outstandingQuantity ?? 0) > 0
  );
  const pickedLines = lines.filter((l: any) => (l.pickedQuantity ?? 0) > 0);

  const onClose = () => navigate(path.to.pickingList(id));

  useEffect(() => {
    if (fetcher.data?.success === true) {
      navigate(path.to.pickingLists);
    } else if (fetcher.data?.success === false) {
      setBackendError(fetcher.data.message ?? "Failed to confirm picking list");
    }
  }, [fetcher.data, navigate]);

  const onConfirm = () => {
    setBackendError(null);
    fetcher.submit(
      { shortageReason },
      { method: "post", action: path.to.pickingListConfirm(id) }
    );
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>
            <Trans>Confirm Picking List</Trans>
          </ModalTitle>
          <ModalDescription>
            <Trans>
              Confirming will post consumption ledger entries for all picked
              quantities. This cannot be undone.
            </Trans>
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {backendError && (
            <Alert variant="destructive">
              <LuTriangleAlert className="h-4 w-4" />
              <AlertTitle>{backendError}</AlertTitle>
            </Alert>
          )}

          <div className="text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">
                <Trans>Lines picked</Trans>
              </span>
              <span>
                {pickedLines.length} / {lines.length}
              </span>
            </div>
          </div>

          {hasOutstanding && (
            <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950">
              <LuTriangleAlert className="text-orange-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-orange-700 dark:text-orange-400">
                  <Trans>Outstanding quantities</Trans>
                </div>
                <div className="text-orange-600 dark:text-orange-500 text-xs mt-1">
                  <Trans>
                    Some lines have not been fully picked. A shortage reason is
                    required.
                  </Trans>
                </div>
              </div>
            </div>
          )}

          {hasOutstanding && (
            <FormControl>
              <FormLabel>
                <Trans>Shortage Reason</Trans>
                <span className="text-destructive ml-1">*</span>
              </FormLabel>
              <Textarea
                value={shortageReason}
                onChange={(e) => setShortageReason(e.target.value)}
                placeholder={t`Explain why some items could not be picked...`}
                rows={3}
              />
            </FormControl>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            leftIcon={<LuCircleCheck />}
            isDisabled={hasOutstanding && !shortageReason.trim()}
            isLoading={fetcher.state !== "idle"}
            onClick={onConfirm}
          >
            <Trans>Confirm</Trans>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
