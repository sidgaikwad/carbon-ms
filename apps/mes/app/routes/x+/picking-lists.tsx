import { requirePermissions } from "@carbon/auth/auth.server";
import { Badge, Button, Heading, Input, SidebarTrigger } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import {
  LuArrowRight,
  LuCalendar,
  LuClipboardList,
  LuMapPin,
  LuSearch
} from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getPickingListsForOperator } from "~/services/inventory.service";
import { getLocation } from "~/services/location.server";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});
  const locationId = await getLocation(request, client, { userId, companyId });

  const pickingLists = await getPickingListsForOperator(client, companyId, {
    userId,
    locationId: locationId ?? undefined
  });

  return { pickingLists: pickingLists.data ?? [] };
}

export default function PickingListsRoute() {
  const { t } = useLingui();
  const { pickingLists } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    if (!searchTerm) return pickingLists;
    const q = searchTerm.toLowerCase();
    return pickingLists.filter((pl: any) => {
      const job = pl.job as any;
      return (
        pl.pickingListId?.toLowerCase().includes(q) ||
        job?.jobId?.toLowerCase().includes(q) ||
        job?.item?.readableId?.toLowerCase().includes(q) ||
        job?.item?.name?.toLowerCase().includes(q)
      );
    });
  }, [pickingLists, searchTerm]);

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b bg-background">
        <div className="flex items-center gap-2 px-2">
          <SidebarTrigger />
          <Heading size="h4">
            <Trans>Picking Lists</Trans>
          </Heading>
        </div>
      </header>

      <main className="h-[calc(100dvh-var(--header-height))] w-full overflow-y-auto">
        <div className="w-full p-4">
          <div className="relative">
            <LuSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t`Search by PL, job, or item`}
              className="pl-8"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col flex-1 w-full items-center justify-center gap-4 py-16">
            <div className="flex justify-center items-center h-12 w-12 rounded-full bg-muted text-muted-foreground">
              <LuClipboardList className="h-6 w-6" />
            </div>
            <span className="text-xs uppercase font-mono text-muted-foreground">
              {searchTerm ? (
                <Trans>No results</Trans>
              ) : (
                <Trans>No picking lists ready to pick</Trans>
              )}
            </span>
            {searchTerm && (
              <Button onClick={() => setSearchTerm("")}>
                <Trans>Clear Search</Trans>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] p-4 gap-4">
            {filtered.map((pl: any) => (
              <Link
                key={pl.id}
                to={path.to.pickingList(pl.id)}
                className="block rounded-lg border bg-card p-4 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="font-semibold truncate">
                      {pl.pickingListId}
                    </span>
                    {pl.job && (
                      <>
                        <span className="text-xs text-muted-foreground truncate">
                          {pl.job.jobId} —{" "}
                          {pl.job.item?.readableId ?? pl.job.item?.name ?? ""}
                        </span>
                        {pl.job.item?.name && (
                          <span className="text-xs text-muted-foreground truncate">
                            {pl.job.item.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <Badge variant="outline">{pl.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {pl.location?.name && (
                    <span className="flex items-center gap-1">
                      <LuMapPin className="h-3 w-3" />
                      {pl.location.name}
                    </span>
                  )}
                  {pl.dueDate && (
                    <span className="flex items-center gap-1">
                      <LuCalendar className="h-3 w-3" />
                      {new Date(pl.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {!pl.assignee && (
                    <Badge variant="outline" className="text-xs">
                      <Trans>Unassigned</Trans>
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex justify-end">
                  <LuArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
