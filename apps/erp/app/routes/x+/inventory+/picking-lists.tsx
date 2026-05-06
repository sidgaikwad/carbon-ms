import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { msg } from "@lingui/core/macro";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getPickingLists, PickingListsTable } from "~/modules/inventory";
import { getLocationsList } from "~/modules/resources";
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
  const { limit, offset, filters } = getGenericQueryFilters(searchParams);

  // Status comes from standard ?filter=status:eq:Draft params
  const statusFilter = (filters ?? [])
    .filter((f) => f.column === "status")
    .flatMap((f) => f.value.split(","));

  let locationId = searchParams.get("location");

  if (!locationId) {
    const userDefaults = await getUserDefaults(client, userId, companyId);
    locationId = userDefaults.data?.locationId ?? null;
  }

  const [pickingLists, locationsList] = await Promise.all([
    getPickingLists(client, companyId, {
      locationId: locationId ?? undefined,
      status: statusFilter.length ? statusFilter : undefined,
      search: search ?? undefined,
      limit,
      offset
    }),
    getLocationsList(client, companyId)
  ]);

  if (pickingLists.error) {
    throw redirect(
      path.to.inventory,
      await flash(request, error(null, "Error loading picking lists"))
    );
  }

  return {
    pickingLists: pickingLists.data ?? [],
    count: pickingLists.count ?? 0,
    locationId,
    locations: locationsList.data ?? []
  };
}

export default function PickingListsRoute() {
  const { pickingLists, count, locationId, locations } =
    useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <PickingListsTable
        data={pickingLists}
        count={count}
        locationId={locationId}
        locations={locations}
      />
      <Outlet />
    </VStack>
  );
}
