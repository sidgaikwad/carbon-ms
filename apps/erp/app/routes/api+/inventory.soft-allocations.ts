import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";
import { getActiveAllocations } from "~/modules/inventory/inventory.service";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const url = new URL(request.url);
  const itemIdsParam = url.searchParams.get("itemIds");
  if (!itemIdsParam) return { data: [], error: null };

  const itemIds = itemIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const excludePickingListId =
    url.searchParams.get("excludePickingListId") ?? undefined;

  return getActiveAllocations(client, companyId, itemIds, excludePickingListId);
}
