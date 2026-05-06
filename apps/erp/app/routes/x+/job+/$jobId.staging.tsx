import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HStack,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LuArrowRightLeft, LuTriangleAlert } from "react-icons/lu";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData, useParams } from "react-router";
import { Empty } from "~/components";
import { path, requestReferrer } from "~/utils/path";

type StagingMaterial = {
  jobMaterialId: string;
  itemId: string;
  itemReadableId: string | null;
  itemName: string | null;
  unitOfMeasureCode: string | null;
  pickStorageUnitId: string | null;
  pickStorageUnitName: string | null;
  estimatedQuantity: number;
  atPickLocation: number;
  elsewhere: number;
  shortage: number;
  sourceStorageUnitId: string | null;
  sourceStorageUnitName: string | null;
  sourceStorageUnitQuantity: number | null;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "production"
  });

  const { jobId } = params;
  if (!jobId) throw new Error("Could not find jobId");

  const { data: stageData, error: stageError } = await client.functions.invoke(
    "pick",
    {
      body: JSON.stringify({
        type: "stageJob",
        jobId,
        companyId,
        userId
      })
    }
  );

  if (stageError) {
    let message = "Failed to assess staging";
    try {
      const body = await (stageError as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // best-effort
    }
    throw redirect(
      requestReferrer(request) ?? path.to.job(jobId),
      await flash(request, error(stageError, message))
    );
  }

  return {
    materials: ((stageData as any)?.materials ?? []) as StagingMaterial[]
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { jobId } = params;
  if (!jobId) throw new Error("Could not find jobId");

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({
      type: "generateStockTransfer",
      jobId,
      companyId,
      userId
    })
  });

  if (fnError) {
    let message = "Failed to generate stock transfer";
    try {
      const body = await (fnError as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // best-effort
    }
    return redirect(
      path.to.jobStaging(jobId),
      await flash(request, error(fnError, message))
    );
  }

  return redirect(
    path.to.jobStaging(jobId),
    await flash(request, success("Stock transfer generated"))
  );
}

export default function JobStagingRoute() {
  const { jobId } = useParams();
  if (!jobId) throw new Error("jobId required");

  const { materials } = useLoaderData<typeof loader>();
  const { t } = useLingui();
  const fetcher = useFetcher();

  const shortageCount = materials.filter((m) => m.shortage > 0).length;
  const actionableShortages = materials.filter(
    (m) =>
      m.shortage > 0 &&
      m.sourceStorageUnitId &&
      m.sourceStorageUnitId !== m.pickStorageUnitId
  ).length;

  return (
    <VStack spacing={4} className="p-4">
      <Card>
        <CardHeader>
          <HStack className="justify-between">
            <CardTitle>
              <Trans>Staging Assessment</Trans>
              {materials.length > 0 && (
                <span className="ml-2 text-muted-foreground font-normal text-sm">
                  {shortageCount}/{materials.length} <Trans>short</Trans>
                </span>
              )}
            </CardTitle>
            {actionableShortages > 0 && (
              <fetcher.Form method="post">
                <Button
                  type="submit"
                  leftIcon={<LuArrowRightLeft />}
                  isLoading={fetcher.state !== "idle"}
                >
                  <Trans>Generate Stock Transfer</Trans>
                </Button>
              </fetcher.Form>
            )}
          </HStack>
        </CardHeader>
        <CardContent className="p-0">
          {materials.length === 0 ? (
            <Empty className="py-6">
              <span className="text-xs text-muted-foreground">
                {t`No Pull-from-Inventory materials require staging for this job.`}
              </span>
            </Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <Trans>Item</Trans>
                  </th>
                  <th className="px-4 py-2 text-left">
                    <Trans>Pick Shelf</Trans>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <Trans>Required</Trans>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <Trans>At Pick</Trans>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <Trans>Elsewhere</Trans>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <Trans>Shortage</Trans>
                  </th>
                  <th className="px-4 py-2 text-left">
                    <Trans>Suggested Source</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const isShort = m.shortage > 0;
                  const sourceUnavailable =
                    isShort && (!m.sourceStorageUnitId || m.elsewhere === 0);
                  return (
                    <tr key={m.jobMaterialId} className="border-t">
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {m.itemReadableId}
                          </span>
                          {m.itemName && (
                            <span className="text-xs text-muted-foreground">
                              {m.itemName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {m.pickStorageUnitName ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.estimatedQuantity} {m.unitOfMeasureCode}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.atPickLocation}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {m.elsewhere}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isShort ? (
                          <Badge
                            variant="outline"
                            className="text-orange-600 border-orange-300"
                          >
                            <LuTriangleAlert className="h-3 w-3 mr-1" />
                            {m.shortage}
                          </Badge>
                        ) : (
                          <span className="text-emerald-600">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!isShort ? (
                          <span className="text-muted-foreground">—</span>
                        ) : sourceUnavailable ? (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive"
                          >
                            <Trans>No source available</Trans>
                          </Badge>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {m.sourceStorageUnitName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {m.sourceStorageUnitQuantity}{" "}
                              <Trans>available</Trans>
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </VStack>
  );
}
