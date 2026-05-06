import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { data, error } = await client
    .from("job")
    .select("id, jobId")
    .eq("companyId", companyId)
    .order("jobId");

  return { data: data ?? [], error };
}
