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
import { useFetcher, useNavigate } from "react-router";
import type { PickingListLine } from "~/modules/inventory";
import { path } from "~/utils/path";

interface PickingListConfirmModalProps {
  pickingListId: string;
  lines: PickingListLine[];
  onClose: () => void;
}

export default function PickingListConfirmModal({
  pickingListId,
  lines,
  onClose
}: PickingListConfirmModalProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [shortageReason, setShortageReason] = useState("");
  const [backendError, setBackendError] = useState<string | null>(null);
  const fetcher = useFetcher<{ success: boolean; message?: string }>();

  useEffect(() => {
    if (fetcher.data?.success === true) {
      onClose();
      navigate(path.to.pickingList(pickingListId));
    } else if (fetcher.data?.success === false) {
      setBackendError(fetcher.data.message ?? "Failed to confirm picking list");
    }
  }, [fetcher.data, onClose, navigate, pickingListId]);

  const hasOutstanding = lines.some((l) => (l.outstandingQuantity ?? 0) > 0);
  const pickedLines = lines.filter((l) => (l.pickedQuantity ?? 0) > 0);

  const onConfirm = () => {
    setBackendError(null);
    fetcher.submit(
      { shortageReason },
      { method: "post", action: `/x/picking-list/${pickingListId}/confirm` }
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
            <Trans>Confirm Picking List</Trans>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
