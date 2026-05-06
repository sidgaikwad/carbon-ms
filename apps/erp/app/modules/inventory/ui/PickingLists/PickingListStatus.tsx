import { Badge } from "@carbon/react";
import type { pickingListStatusType } from "../../inventory.models";

type PickingListStatusValue = (typeof pickingListStatusType)[number];

const statusColors: Record<
  PickingListStatusValue,
  "gray" | "blue" | "orange" | "green" | "red"
> = {
  Draft: "gray",
  Released: "blue",
  "In Progress": "orange",
  Confirmed: "green",
  Cancelled: "red"
};

interface PickingListStatusProps {
  status: PickingListStatusValue;
}

export default function PickingListStatus({ status }: PickingListStatusProps) {
  return <Badge color={statusColors[status]}>{status}</Badge>;
}
