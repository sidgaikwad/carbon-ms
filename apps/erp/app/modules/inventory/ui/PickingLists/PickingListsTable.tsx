import { Button, MenuIcon, MenuItem } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useCallback, useMemo } from "react";
import {
  LuBookMarked,
  LuCalendar,
  LuCirclePlus,
  LuMapPin,
  LuUser
} from "react-icons/lu";
import { useNavigate } from "react-router";
import { EmployeeAvatar, Hyperlink, Table } from "~/components";
import { Enumerable } from "~/components/Enumerable";
import { useLocations } from "~/components/Form/Location";
import { useDateFormatter, usePermissions } from "~/hooks";
import { path } from "~/utils/path";
import type { PickingList } from "../../types";
import PickingListStatus from "./PickingListStatus";

type PickingListsTableProps = {
  data: PickingList[];
  count: number;
  locationId?: string;
};

const PickingListsTable = memo(
  ({ data, count, locationId }: PickingListsTableProps) => {
    const { t } = useLingui();
    const { formatDate } = useDateFormatter();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const locations = useLocations();

    const columns = useMemo<ColumnDef<PickingList>[]>(
      () => [
        {
          accessorKey: "pickingListId",
          header: t`Picking List`,
          cell: ({ row }) => (
            <Hyperlink to={path.to.pickingList(row.original.id!)}>
              {row.original.pickingListId}
            </Hyperlink>
          ),
          meta: { icon: <LuBookMarked /> }
        },
        {
          accessorKey: "status",
          header: t`Status`,
          cell: ({ row }) => (
            <PickingListStatus status={row.original.status as any} />
          )
        },
        {
          accessorKey: "locationId",
          header: t`Location`,
          cell: ({ row }) => (
            <Enumerable
              value={
                locations.find((l) => l.value === row.original.locationId)
                  ?.label ?? null
              }
            />
          ),
          meta: { icon: <LuMapPin /> }
        },
        {
          id: "job",
          header: t`Job`,
          cell: ({ row }) => {
            const job = (row.original as any).job;
            return job ? (
              <Hyperlink to={path.to.job(job.id ?? row.original.jobId)}>
                {job.jobId}
              </Hyperlink>
            ) : null;
          },
          meta: { icon: <LuBookMarked /> }
        },
        {
          accessorKey: "assignee",
          header: t`Assignee`,
          cell: ({ row }) => {
            const user = (row.original as any).assigneeUser;
            return user ? (
              <EmployeeAvatar
                name={user.fullName}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
            ) : null;
          },
          meta: { icon: <LuUser /> }
        },
        {
          accessorKey: "dueDate",
          header: t`Due Date`,
          cell: ({ row }) =>
            row.original.dueDate ? formatDate(row.original.dueDate) : null,
          meta: { icon: <LuCalendar /> }
        }
      ],
      [t, formatDate, locations]
    );

    const actions = useCallback(
      (row: PickingList): React.ReactNode[] => {
        const actions: React.ReactNode[] = [
          <MenuItem
            key="open"
            onClick={() => navigate(path.to.pickingList(row.id!))}
          >
            <MenuIcon icon={<LuBookMarked />} />
            <Trans>Open</Trans>
          </MenuItem>
        ];
        return actions;
      },
      [navigate]
    );

    return (
      <>
        <Table<PickingList>
          data={data}
          columns={columns}
          count={count}
          actions={actions}
          primaryAction={
            permissions.can("create", "inventory") ? (
              <Button
                leftIcon={<LuCirclePlus />}
                onClick={() => navigate(path.to.newPickingList)}
              >
                <Trans>New Picking List</Trans>
              </Button>
            ) : undefined
          }
          withSearch
          withFilters
          withColumnVisibility
          withPagination
        />
      </>
    );
  }
);

PickingListsTable.displayName = "PickingListsTable";

export default PickingListsTable;
