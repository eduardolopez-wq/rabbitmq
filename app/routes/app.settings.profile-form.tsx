import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { syncShopProfileFormShopMetafield } from "../services/profile-form-shop-metafield.server";
import { getProfileFormSettingsForShop } from "../services/shop-profile-form-settings.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type ActionData = { ok: true } | { ok: false };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getProfileFormSettingsForShop(session.shop);
  return { shop: session.shop, settings };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionData> => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const profileFormEnablePortugal =
    String(formData.get("profileFormEnablePortugal") ?? "") === "true";

  await prisma.shopProfileFormSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      profileFormEnablePortugal,
    },
    update: { profileFormEnablePortugal },
  });

  await syncShopProfileFormShopMetafield(admin, profileFormEnablePortugal);

  return { ok: true };
};

export default function ProfileFormSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isSaving =
    fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === true) {
      shopify.toast.show("Configuración del formulario guardada");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const defaults = {
    profileFormEnablePortugal: settings?.profileFormEnablePortugal ?? false,
  };

  return (
    <s-page heading="Formulario datos personales (cuenta cliente)">
      <fetcher.Form method="post" key={settings?.updatedAt ?? "new"}>
        <s-stack direction="block" gap="large">
          <s-section heading="País en el formulario">
            <s-stack direction="block" gap="base">
              <s-text>
                ¿Mostrar Portugal en el formulario de perfil del cliente?
              </s-text>
              <s-stack direction="block" gap="base">
                <label>
                  <input
                    type="radio"
                    name="profileFormEnablePortugal"
                    value="false"
                    defaultChecked={!defaults.profileFormEnablePortugal}
                  />{" "}
                  No — solo España (sin selector de país)
                </label>
                <label>
                  <input
                    type="radio"
                    name="profileFormEnablePortugal"
                    value="true"
                    defaultChecked={defaults.profileFormEnablePortugal}
                  />{" "}
                  Sí — mostrar selector España / Portugal
                </label>
              </s-stack>
              <s-text tone="neutral">
                Si eliges solo España, el campo país del formulario de la cuenta cliente no se mostrará.
              </s-text>
            </s-stack>
          </s-section>

          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              type="submit"
              {...(isSaving ? { loading: true } : {})}
            >
              Guardar formulario
            </s-button>
          </s-stack>
        </s-stack>
      </fetcher.Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
