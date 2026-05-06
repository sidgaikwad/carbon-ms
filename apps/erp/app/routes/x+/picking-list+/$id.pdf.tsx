import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { Button } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { LuPrinter, LuX } from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigate, useParams } from "react-router";
import { getPickingList } from "~/modules/inventory";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("id not found");

  const [pickingList, pickingListLines] = await Promise.all([
    getPickingList(client, id),
    client
      .from("pickingListLine")
      .select(
        `*, item:itemId(id, name, readableId, unitOfMeasureCode),
         storageUnit:storageUnitId(id, name),
         destinationStorageUnit:destinationStorageUnitId(id, name)`
      )
      .eq("pickingListId", id)
      .order("storageUnitId", { ascending: true, nullsFirst: false })
      .order("createdAt", { ascending: true })
  ]);

  if (pickingList.error || !pickingList.data) {
    throw redirect(
      path.to.pickingLists,
      await flash(request, error(null, "Failed to load picking list"))
    );
  }

  if (pickingList.data.companyId !== companyId) {
    throw redirect(path.to.pickingLists);
  }

  return {
    pickingList: pickingList.data,
    lines: pickingListLines.data ?? []
  };
}

export default function PickingListPdfRoute() {
  const { id } = useParams();
  const { pickingList, lines } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const pl = pickingList as any;

  return (
    <>
      {/* Print controls — hidden in print */}
      <div className="fixed top-4 right-4 z-50 flex gap-2 print:hidden">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<LuX />}
          onClick={() => navigate(path.to.pickingList(id!))}
        >
          <Trans>Close</Trans>
        </Button>
        <Button
          size="sm"
          leftIcon={<LuPrinter />}
          onClick={() => window.print()}
        >
          <Trans>Print</Trans>
        </Button>
      </div>

      {/* Printable content */}
      <div id="pl-pdf-content" className="p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">{pl.pickingListId}</h1>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">
                <Trans>Status:</Trans>
              </span>{" "}
              {pl.status}
              {pl.dueDate && (
                <>
                  {" · "}
                  <span className="font-medium">
                    <Trans>Due:</Trans>
                  </span>{" "}
                  {new Date(pl.dueDate).toLocaleDateString()}
                </>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>
              <Trans>Job:</Trans>{" "}
              <span className="font-medium">{pl.job?.jobId ?? "—"}</span>
            </div>
            <div>
              <Trans>Location:</Trans>{" "}
              <span className="font-medium">{pl.location?.name ?? "—"}</span>
            </div>
            {pl.assigneeUser?.fullName && (
              <div>
                <Trans>Assignee:</Trans>{" "}
                <span className="font-medium">{pl.assigneeUser.fullName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Lines table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">
                <Trans>Item</Trans>
              </th>
              <th className="text-left py-2 pr-4 font-semibold">
                <Trans>Location / Shelf</Trans>
              </th>
              <th className="text-right py-2 pr-4 font-semibold">
                <Trans>Required</Trans>
              </th>
              <th className="text-right py-2 pr-4 font-semibold">
                <Trans>Picked</Trans>
              </th>
              <th className="text-right py-2 font-semibold">
                <Trans>Outstanding</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {(lines as any[]).map((line: any) => (
              <tr key={line.id} className="border-b">
                <td className="py-2 pr-4">
                  <div className="font-medium">
                    {line.item?.name ?? line.itemId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {line.item?.readableId}
                  </div>
                  {line.pickedTrackedEntityId && (
                    <div className="text-xs text-muted-foreground">
                      ID: {line.pickedTrackedEntityId}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {line.storageUnit?.name ?? "—"}
                </td>
                <td className="py-2 pr-4 text-right">
                  {line.adjustedQuantity ?? line.estimatedQuantity}{" "}
                  {line.unitOfMeasureCode}
                </td>
                <td className="py-2 pr-4 text-right">
                  {(line.pickedQuantity ?? 0) > 0 ? (
                    <span className="text-green-700 font-medium">
                      {line.pickedQuantity} {line.unitOfMeasureCode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {(line.outstandingQuantity ?? 0) > 0 ? (
                    <span className="text-orange-600">
                      {line.outstandingQuantity} {line.unitOfMeasureCode}
                    </span>
                  ) : (
                    <span className="text-green-700">✓</span>
                  )}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  <Trans>No lines</Trans>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Summary */}
        {lines.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            {
              (lines as any[]).filter((l: any) => (l.pickedQuantity ?? 0) > 0)
                .length
            }{" "}
            / {lines.length} <Trans>lines picked</Trans>
          </div>
        )}

        {/* Signature line */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-sm print:block">
          <div className="border-t pt-2">
            <Trans>Picker Signature</Trans>
          </div>
          <div className="border-t pt-2">
            <Trans>Supervisor Signature</Trans>
          </div>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pl-pdf-content, #pl-pdf-content * { visibility: visible; }
          #pl-pdf-content { position: fixed; top: 0; left: 0; width: 100%; padding: 2rem; }
        }
      `}</style>
    </>
  );
}
