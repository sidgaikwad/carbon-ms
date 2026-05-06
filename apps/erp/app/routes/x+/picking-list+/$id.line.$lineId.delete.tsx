import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { lineId } = params;
  if (!lineId) throw new Error("lineId not found");

  const { error: deleteError } = await client
    .from("pickingListLine")
    .delete()
    .eq("id", lineId)
    .eq("companyId", companyId);

  if (deleteError) {
    return data(
      { success: false },
      await flash(request, error(deleteError.message, "Failed to delete line"))
    );
  }

  return data({ success: true }, await flash(request, success("Line deleted")));
}
