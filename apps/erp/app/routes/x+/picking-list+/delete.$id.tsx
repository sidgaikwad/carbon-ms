import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { deletePickingList, getPickingList } from "~/modules/inventory";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client } = await requirePermissions(request, {
    delete: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("id not found");

  const pl = await getPickingList(client, id);
  if (!pl.data || !["Draft", "Cancelled"].includes(pl.data.status)) {
    throw redirect(
      path.to.pickingLists,
      await flash(
        request,
        error(null, "Only Draft or Cancelled picking lists can be deleted")
      )
    );
  }

  const { error: deleteError } = await deletePickingList(client, id);
  if (deleteError) {
    throw redirect(
      path.to.pickingLists,
      await flash(request, error(deleteError, "Failed to delete picking list"))
    );
  }

  throw redirect(
    path.to.pickingLists,
    await flash(request, success("Picking list deleted"))
  );
}
