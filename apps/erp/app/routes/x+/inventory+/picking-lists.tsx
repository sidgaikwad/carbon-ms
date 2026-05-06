import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { msg } from "@lingui/core/macro";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getPickingLists, PickingListsTable } from "~/modules/inventory";
import { getUserDefaults } from "~/modules/users/users.server";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";
import { getGenericQueryFilters } from "~/utils/query";

export const handle: Handle = {
  breadcrumb: msg`Picking Lists`,
  to: path.to.pickingLists,
  module: "inventory"
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "inventory"
  });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.get("search");
  const statusFilter = searchParams.getAll("status");
  const { limit, offset } = getGenericQueryFilters(searchParams);

  let locationId = searchParams.get("location");

  if (!locationId) {
    const userDefaults = await getUserDefaults(client, userId, companyId);
    locationId = userDefaults.data?.locationId ?? null;
  }

  const pickingLists = await getPickingLists(client, companyId, {
    locationId: locationId ?? undefined,
    status: statusFilter.length ? statusFilter : undefined,
    search: search ?? undefined,
    limit,
    offset
  });

  if (pickingLists.error) {
    throw redirect(
      path.to.inventory,
      await flash(request, error(null, "Error loading picking lists"))
    );
  }

  return {
    pickingLists: pickingLists.data ?? [],
    count: pickingLists.count ?? 0,
    locationId
  };
}

export default function PickingListsRoute() {
  const { pickingLists, count, locationId } = useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <PickingListsTable
        data={pickingLists}
        count={count}
        locationId={locationId ?? undefined}
      />
      <Outlet />
    </VStack>
  );
}
