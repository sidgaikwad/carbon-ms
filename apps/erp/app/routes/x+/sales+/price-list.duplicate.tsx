import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { duplicatePriceOverrides } from "~/modules/sales";
import { getParams, path } from "~/utils/path";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "sales"
  });

  const formData = await request.formData();
  const sourceCustomerId =
    (formData.get("sourceCustomerId") as string) || undefined;
  const sourceCustomerTypeId =
    (formData.get("sourceCustomerTypeId") as string) || undefined;
  const targetCustomerId =
    (formData.get("targetCustomerId") as string) || undefined;
  const targetCustomerTypeId =
    (formData.get("targetCustomerTypeId") as string) || undefined;
  const conflictStrategy =
    (formData.get("conflictStrategy") as "skip" | "overwrite") || "skip";

  let overrideIds: string[] | undefined;
  const overrideIdsRaw = formData.get("overrideIds") as string;
  if (overrideIdsRaw) {
    try {
      overrideIds = JSON.parse(overrideIdsRaw);
    } catch {
      // ignore parse error
    }
  }

  if (!targetCustomerId && !targetCustomerTypeId) {
    throw redirect(
      `${path.to.salesPriceList}?${getParams(request)}`,
      await flash(request, error(null, "Please select a target scope"))
    );
  }

  const result = await duplicatePriceOverrides(
    client,
    companyId,
    userId,
    {
      customerId: sourceCustomerId,
      customerTypeId: sourceCustomerTypeId
    },
    {
      customerId: targetCustomerId,
      customerTypeId: targetCustomerTypeId
    },
    { overrideIds, conflictStrategy }
  );

  if (result.error) {
    throw redirect(
      `${path.to.salesPriceList}?${getParams(request)}`,
      await flash(
        request,
        error(result.error, "Failed to duplicate price list")
      )
    );
  }

  const parts = [];
  if (result.duplicated > 0) parts.push(`${result.duplicated} duplicated`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.overwritten > 0) parts.push(`${result.overwritten} overwritten`);
  const message = parts.length > 0 ? parts.join(", ") : "Nothing to duplicate";

  throw redirect(
    `${path.to.salesPriceList}?${getParams(request)}`,
    await flash(request, success(message))
  );
}
