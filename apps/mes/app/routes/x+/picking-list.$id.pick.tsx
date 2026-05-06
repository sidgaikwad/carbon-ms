import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { path, requestReferrer } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const formData = await request.formData();
  const pickingListLineId = formData.get("pickingListLineId") as string;
  const pickedQuantity = parseFloat(
    (formData.get("pickedQuantity") as string) ?? "0"
  );

  if (!pickingListLineId) {
    return data(
      { success: false },
      await flash(request, error(null, "Missing line id"))
    );
  }

  const serviceRole = await getCarbonServiceRole();

  // Treat 0 as an unpick
  const operationType = pickedQuantity > 0 ? "pickInventoryLine" : "unpickLine";

  const { error: fnError } = await serviceRole.functions.invoke("pick", {
    body: JSON.stringify({
      type: operationType,
      pickingListId: id,
      pickingListLineId,
      pickedQuantity,
      companyId,
      userId
    })
  });

  if (fnError) {
    let message = "Failed to pick line";
    try {
      const body = await (fnError as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // best-effort
    }
    throw redirect(
      requestReferrer(request) ?? path.to.pickingList(id),
      await flash(request, error(null, message))
    );
  }

  throw redirect(
    requestReferrer(request) ?? path.to.pickingList(id),
    await flash(request, success("Line updated"))
  );
}
