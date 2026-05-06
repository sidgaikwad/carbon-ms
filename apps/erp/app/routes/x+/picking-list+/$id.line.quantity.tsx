import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("id not found");

  const formData = await request.formData();
  const pickingListLineId = formData.get("pickingListLineId") as string;
  const pickedQuantity = parseFloat(formData.get("pickedQuantity") as string);

  if (!pickingListLineId || isNaN(pickedQuantity)) {
    return data(
      { success: false },
      await flash(request, error(null, "Invalid form data"))
    );
  }

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({
      type: "pickInventoryLine",
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
      // Best effort parse of edge-function error payload.
    }
    return data({ success: false }, await flash(request, error(null, message)));
  }

  return data(
    { success: true },
    await flash(request, success(`${pickedQuantity} units marked as picked`))
  );
}
