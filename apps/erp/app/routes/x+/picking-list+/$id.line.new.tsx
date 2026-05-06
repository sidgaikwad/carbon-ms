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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  useFetcher,
  useNavigate,
  useNavigation,
  useParams
} from "react-router";
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

  const { id } = params;
  if (!id) throw new Error("id not found");

  const formData = await request.formData();
  const itemId = formData.get("itemId") as string;
  const estimatedQuantity = parseFloat(
    formData.get("estimatedQuantity") as string
  );
  const storageUnitId = (formData.get("storageUnitId") as string) || null;
  const unitOfMeasureCode =
    (formData.get("unitOfMeasureCode") as string) || null;

  if (!itemId || isNaN(estimatedQuantity) || estimatedQuantity <= 0) {
    return data(
      { success: false },
      await flash(
        request,
        error(null, "Item ID and a positive quantity are required")
      )
    );
  }

  const { data: pl } = await client
    .from("pickingList")
    .select("status, jobId")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();

  if (!pl || !["Draft", "Released", "In Progress"].includes(pl.status)) {
    return data(
      { success: false },
      await flash(request, error(null, "Cannot add lines to this picking list"))
    );
  }

  // jobMaterialId is null for manually-added lines (no BOM source)
  const { error: insertError } = await client.from("pickingListLine").insert({
    pickingListId: id,
    jobMaterialId: null,
    itemId,
    storageUnitId,
    estimatedQuantity,
    unitOfMeasureCode,
    companyId,
    createdBy: userId
  });

  if (insertError) {
    return data(
      { success: false },
      await flash(request, error(insertError.message, "Failed to add line"))
    );
  }

  return data({ success: true }, await flash(request, success("Line added")));
}

export default function PickingListLineNewRoute() {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const { t } = useLingui();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const onClose = () => navigate(path.to.pickingList(id));
  const isSubmitting =
    navigation.state === "submitting" || fetcher.state !== "idle";

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <fetcher.Form method="post" className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle>
              <Trans>Add Manual Line</Trans>
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <VStack spacing={4}>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Manually add a line to pick an item not in the job bill of
                  materials.
                </Trans>
              </p>
              <FormControl>
                <FormLabel>
                  <Trans>Item ID</Trans>
                  <span className="text-destructive ml-1">*</span>
                </FormLabel>
                <Input
                  name="itemId"
                  placeholder="Paste item internal ID (xid)"
                />
              </FormControl>
              <FormControl>
                <FormLabel>
                  <Trans>Quantity</Trans>
                  <span className="text-destructive ml-1">*</span>
                </FormLabel>
                <Input
                  name="estimatedQuantity"
                  type="number"
                  min={0.001}
                  step="any"
                  placeholder="0"
                />
              </FormControl>
              <FormControl>
                <FormLabel>
                  <Trans>Unit of Measure</Trans>
                </FormLabel>
                <Input name="unitOfMeasureCode" placeholder={t`EA`} />
              </FormControl>
              <FormControl>
                <FormLabel>
                  <Trans>Source Storage Unit ID</Trans>
                </FormLabel>
                <Input
                  name="storageUnitId"
                  placeholder="Paste storage unit ID (xid)"
                />
              </FormControl>
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Trans>Add Line</Trans>
            </Button>
          </DrawerFooter>
        </fetcher.Form>
      </DrawerContent>
    </Drawer>
  );
}
