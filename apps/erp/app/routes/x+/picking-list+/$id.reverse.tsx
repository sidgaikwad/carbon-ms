import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("id not found");

  const { error: fnError } = await client.functions.invoke("pick", {
    body: JSON.stringify({
      type: "reversePickingList",
      pickingListId: id,
      companyId,
      userId
    })
  });

  if (fnError) {
    return data(
      {
        success: false,
        message: fnError.message ?? "Failed to reverse picking list"
      },
      await flash(
        request,
        error(fnError.message, "Failed to reverse picking list")
      )
    );
  }

  throw redirect(
    path.to.pickingLists,
    await flash(
      request,
      success("Picking list reversed and consumption rolled back")
    )
  );
}
