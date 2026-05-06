import type { Result } from "@carbon/auth";
import {
  Button,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Heading,
  HStack,
  IconButton,
  useDisclosure
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  LuCircleCheck,
  LuCirclePlay,
  LuEllipsisVertical,
  LuRefreshCw,
  LuTrash
} from "react-icons/lu";
import { useFetcher, useParams } from "react-router";
import Assignee, { useOptimisticAssignment } from "~/components/Assignee";
import { ConfirmDelete } from "~/components/Modals";
import { usePermissions, useRouteData } from "~/hooks";
import type { PickingListDetail, PickingListLine } from "~/modules/inventory";
import { path } from "~/utils/path";
import PickingListStatus from "./PickingListStatus";

const PickingListHeader = () => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const routeData = useRouteData<{
    pickingList: PickingListDetail;
    pickingListLines: PickingListLine[];
  }>(path.to.pickingList(id));

  if (!routeData?.pickingList) throw new Error("Failed to load picking list");

  const { t } = useLingui();
  const permissions = usePermissions();
  const deleteModal = useDisclosure();
  const statusFetcher = useFetcher<Result>();

  const pl = routeData.pickingList;
  const status = pl.status;
  const lines = routeData.pickingListLines ?? [];

  const canRelease =
    status === "Draft" && permissions.can("update", "inventory");
  const canConfirm =
    ["Released", "In Progress"].includes(status) &&
    permissions.can("update", "inventory");
  const canDelete =
    ["Draft", "Cancelled"].includes(status) &&
    permissions.can("delete", "inventory");
  const canCancel =
    !["Confirmed", "Cancelled"].includes(status) &&
    permissions.can("update", "inventory");
  const canRegenerate =
    !["Confirmed", "Cancelled"].includes(status) &&
    !(
      status === "In Progress" && lines.some((l) => (l.pickedQuantity ?? 0) > 0)
    );

  const optimisticAssignment = useOptimisticAssignment({
    id,
    table: "pickingList"
  });
  const assignee =
    optimisticAssignment !== undefined ? optimisticAssignment : pl.assignee;

  return (
    <>
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-2 bg-card border-b border-border h-[50px] overflow-x-auto scrollbar-hide dark:border-none dark:shadow-[inset_0_0_1px_rgb(255_255_255_/_0.24),_0_0_0_0.5px_rgb(0,0,0,1)]">
        <HStack className="w-full justify-between">
          <HStack>
            <Heading size="h4" className="flex items-center gap-2">
              <span>{pl.pickingListId}</span>
            </Heading>
            <Copy text={pl.pickingListId ?? ""} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label={t`More options`}
                  icon={<LuEllipsisVertical />}
                  variant="secondary"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {canRegenerate && (
                  <DropdownMenuItem
                    onClick={() =>
                      statusFetcher.submit(
                        {},
                        {
                          method: "post",
                          action: path.to.regeneratePickingList(id)
                        }
                      )
                    }
                  >
                    <DropdownMenuIcon icon={<LuRefreshCw />} />
                    <Trans>Regenerate Lines</Trans>
                  </DropdownMenuItem>
                )}
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        statusFetcher.submit(
                          { status: "Cancelled" },
                          {
                            method: "post",
                            action: path.to.pickingListStatus(id)
                          }
                        )
                      }
                    >
                      <Trans>Cancel</Trans>
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={deleteModal.onOpen}>
                      <DropdownMenuIcon icon={<LuTrash />} />
                      <Trans>Delete</Trans>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <PickingListStatus status={status} />
          </HStack>

          <HStack>
            <Assignee
              size="md"
              id={id}
              value={assignee ?? ""}
              table="pickingList"
              isReadOnly={!permissions.can("update", "inventory")}
            />

            <statusFetcher.Form
              method="post"
              action={path.to.pickingListStatus(id)}
            >
              <input type="hidden" name="status" value="Released" />
              <Button
                type="submit"
                leftIcon={<LuCirclePlay />}
                variant={canRelease ? "primary" : "secondary"}
                isDisabled={!canRelease || statusFetcher.state !== "idle"}
                isLoading={
                  statusFetcher.state !== "idle" &&
                  statusFetcher.formData?.get("status") === "Released"
                }
              >
                <Trans>Release</Trans>
              </Button>
            </statusFetcher.Form>

            <Button
              leftIcon={<LuCircleCheck />}
              variant={canConfirm ? "primary" : "secondary"}
              isDisabled={!canConfirm}
              onClick={() =>
                statusFetcher.submit(
                  {},
                  { method: "post", action: path.to.confirmPickingList(id) }
                )
              }
            >
              <Trans>Confirm</Trans>
            </Button>
          </HStack>
        </HStack>
      </div>

      {deleteModal.isOpen && (
        <ConfirmDelete
          action={path.to.deletePickingList(id)}
          isOpen={deleteModal.isOpen}
          name={pl.pickingListId ?? "picking list"}
          text={t`Are you sure you want to delete ${pl.pickingListId}? This cannot be undone.`}
          onCancel={deleteModal.onClose}
          onSubmit={deleteModal.onClose}
        />
      )}
    </>
  );
};

export default PickingListHeader;
