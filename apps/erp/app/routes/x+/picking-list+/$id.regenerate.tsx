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

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({
      type: "regeneratePickingList",
      pickingListId: id,
      companyId,
      userId
    })
  });

  if (fnError) {
    return data(
      { success: false },
      await flash(request, error(fnError.message, "Failed to regenerate lines"))
    );
  }

  return data(
    { success: true },
    await flash(request, success("Picking list lines regenerated"))
  );
}
