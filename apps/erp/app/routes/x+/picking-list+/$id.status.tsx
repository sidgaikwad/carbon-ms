import { assertIsPost, error, notFound, success } from "@carbon/auth";
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
  if (!id) throw notFound("id not found");

  const formData = await request.formData();
  const status = formData.get("status") as string;

  if (!status) {
    return data(
      { success: false },
      await flash(request, error(null, "Status is required"))
    );
  }

  let type: string;
  switch (status) {
    case "Released":
      type = "releasePickingList";
      break;
    case "Cancelled":
      type = "cancelPickingList";
      break;
    default:
      return data(
        { success: false },
        await flash(
          request,
          error(null, `Invalid status transition: ${status}`)
        )
      );
  }

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({ type, pickingListId: id, companyId, userId })
  });

  if (fnError) {
    return data(
      { success: false },
      await flash(request, error(fnError.message, "Failed to update status"))
    );
  }

  return data(
    { success: true },
    await flash(request, success(`Picking list ${status.toLowerCase()}`))
  );
}
