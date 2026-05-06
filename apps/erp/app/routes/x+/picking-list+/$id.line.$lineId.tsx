import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormControl,
  FormLabel,
  Input,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  useFetcher,
  useNavigate,
  useNavigation,
  useParams
} from "react-router";
import { useRouteData } from "~/hooks";
import type { PickingListDetail, PickingListLine } from "~/modules/inventory";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermissions(request, { update: "inventory" });
  return {};
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { lineId } = params;
  if (!lineId) throw new Error("lineId not found");

  const formData = await request.formData();
  const raw = formData.get("adjustedQuantity");
  const adjustedQuantity =
    raw !== null && raw !== "" ? parseFloat(String(raw)) : null;

  const { error: updateError } = await client
    .from("pickingListLine")
    .update({
      adjustedQuantity,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", lineId)
    .eq("companyId", companyId);

  if (updateError) {
    return data(
      { success: false },
      await flash(request, error(updateError.message, "Failed to update line"))
    );
  }

  return data({ success: true }, await flash(request, success("Line updated")));
}

export default function PickingListLineEditRoute() {
  const { id, lineId } = useParams();
  if (!id || !lineId) throw new Error("id and lineId are required");

  const { t } = useLingui();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();

  const routeData = useRouteData<{
    pickingList: PickingListDetail;
    pickingListLines: PickingListLine[];
  }>(path.to.pickingList(id));

  const line = routeData?.pickingListLines.find((l) => l.id === lineId);

  const [adjustedQuantity, setAdjustedQuantity] = useState<string>(
    line?.adjustedQuantity != null ? String(line.adjustedQuantity) : ""
  );

  const onClose = () => navigate(path.to.pickingList(id));
  const isSubmitting =
    navigation.state === "submitting" || fetcher.state !== "idle";

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <fetcher.Form method="post" className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>
              <Trans>Edit Line</Trans>
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <VStack spacing={4}>
              {line && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">
                    {(line as any).item?.name}
                  </span>
                  {" · "}
                  <Trans>Estimated:</Trans> {line.estimatedQuantity}{" "}
                  {line.unitOfMeasureCode}
                </div>
              )}
              <FormControl>
                <FormLabel>
                  <Trans>Adjusted Quantity</Trans>
                </FormLabel>
                <Input
                  name="adjustedQuantity"
                  type="number"
                  step="any"
                  min={0}
                  value={adjustedQuantity}
                  onChange={(e) => setAdjustedQuantity(e.target.value)}
                  placeholder={t`Leave blank to use estimated quantity`}
                />
              </FormControl>
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Trans>Save</Trans>
            </Button>
          </DrawerFooter>
        </fetcher.Form>
      </DrawerContent>
    </Drawer>
  );
}
