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
  const shortageReason =
    (formData.get("shortageReason") as string) || undefined;

  const { data: fnResult, error: fnError } = await client.functions.invoke(
    "pick",
    {
      body: JSON.stringify({
        type: "confirmPickingList",
        pickingListId: id,
        shortageReason,
        companyId,
        userId
      })
    }
  );

  if (fnError || fnResult?.error) {
    // Extract backend message from edge function response
    let message = fnError?.message ?? null;
    if (
      !message &&
      fnError &&
      typeof fnError === "object" &&
      "context" in fnError
    ) {
      const ctx = (fnError as any).context;
      if (ctx?.json) {
        const body = await ctx.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          message = (body as any).error;
        }
      } else if (ctx?.text) {
        message = await ctx.text().catch(() => null);
      }
    }
    if (!message && fnResult?.error) {
      message =
        typeof fnResult.error === "string"
          ? fnResult.error
          : "Failed to confirm picking list";
    }
    message = message ?? "Failed to confirm picking list";

    return data(
      { success: false, message },
      await flash(request, error(message, "Failed to confirm picking list"))
    );
  }

  return data(
    { success: true },
    await flash(
      request,
      success("Picking list confirmed and consumption posted")
    )
  );
}
