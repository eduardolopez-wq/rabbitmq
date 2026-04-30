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
import { getIntegrationSettingsForForm } from "../services/shop-settings.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type FieldErrors = Partial<{
  rabbitmqHost: string;
  rabbitmqUser: string;
  rabbitmqPassword: string;
  rabbitmqPort: string;
  rabbitmqVhost: string;
}>;

type ActionData = { ok: true } | { ok: false; errors: FieldErrors };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getIntegrationSettingsForForm(session.shop);
  return { shop: session.shop, settings };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const rabbitmqHost = String(formData.get("rabbitmqHost") ?? "").trim();
  const rabbitmqUser = String(formData.get("rabbitmqUser") ?? "").trim();
  const rabbitmqPasswordRaw = String(formData.get("rabbitmqPassword") ?? "");
  const rabbitmqPortRaw = String(formData.get("rabbitmqPort") ?? "").trim();
  const rabbitmqVhostRaw = String(formData.get("rabbitmqVhost") ?? "").trim();
  const pdsApiKey = String(formData.get("pdsApiKey") ?? "").trim();

  const errors: FieldErrors = {};

  if (!rabbitmqHost) {
    errors.rabbitmqHost = "Obligatorio";
  }
  if (!rabbitmqUser) {
    errors.rabbitmqUser = "Obligatorio";
  }
  const port = Number.parseInt(rabbitmqPortRaw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    errors.rabbitmqPort = "Indica un puerto entre 1 y 65535 (normalmente 5672)";
  }
  const rabbitmqVhost = rabbitmqVhostRaw.trim() || "/";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const existing = await prisma.shopIntegrationSettings.findUnique({
    where: { shop: session.shop },
  });
  const rabbitmqPassword =
    rabbitmqPasswordRaw.trim() || existing?.rabbitmqPassword || "";

  await prisma.shopIntegrationSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      rabbitmqHost,
      rabbitmqUser,
      rabbitmqPassword,
      rabbitmqPort: port,
      rabbitmqVhost,
      pdsApiKey,
    },
    update: {
      rabbitmqHost,
      rabbitmqUser,
      rabbitmqPassword,
      rabbitmqPort: port,
      rabbitmqVhost,
      pdsApiKey,
    },
  });

  return { ok: true };
};

export default function AppHome() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isSaving =
    fetcher.state === "submitting" || fetcher.state === "loading";
  const fieldErrors =
    fetcher.data?.ok === false ? fetcher.data.errors : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === true) {
      shopify.toast.show("Configuración guardada");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const defaults = {
    rabbitmqHost: settings?.rabbitmqHost ?? "",
    rabbitmqUser: settings?.rabbitmqUser ?? "",
    rabbitmqPort: settings?.rabbitmqPort ?? 5672,
    rabbitmqVhost: settings?.rabbitmqVhost ?? "/",
    pdsApiKey: settings?.pdsApiKey ?? "",
  };

  return (
    <s-page heading="Configuración">
      <fetcher.Form method="post" key={settings?.updatedAt ?? "new"}>
        <s-stack direction="block" gap="large">
          <s-section heading="Portal de gestión (RabbitMQ / PDS)">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="URL RabbitMQ"
                name="rabbitmqHost"
                defaultValue={defaults.rabbitmqHost}
                details="Ejemplo: localhost o rmq.vivofacil.org"
                required
                error={fieldErrors?.rabbitmqHost}
              />
              <s-text-field
                label="Usuario RabbitMQ"
                name="rabbitmqUser"
                defaultValue={defaults.rabbitmqUser}
                required
                error={fieldErrors?.rabbitmqUser}
              />
              <s-password-field
                label="Contraseña RabbitMQ"
                name="rabbitmqPassword"
                autocomplete="new-password"
                details={
                  settings?.rabbitmqHasPassword
                    ? "Dejar en blanco para no cambiar la contraseña guardada."
                    : "Obligatoria si el broker la exige."
                }
                error={fieldErrors?.rabbitmqPassword}
              />
              <s-text-field
                label="Puerto RabbitMQ"
                name="rabbitmqPort"
                defaultValue={String(defaults.rabbitmqPort)}
                details="Normalmente 5672"
                required
                error={fieldErrors?.rabbitmqPort}
              />
              <s-text-field
                label="VHost RabbitMQ"
                name="rabbitmqVhost"
                defaultValue={defaults.rabbitmqVhost}
                details="Normalmente /"
                required
                error={fieldErrors?.rabbitmqVhost}
              />
              <s-text-field
                label="PDS API Key"
                name="pdsApiKey"
                defaultValue={defaults.pdsApiKey}
                details="UUID de contrato PDS. Si el cliente no tiene metafield de contrato, se usa este valor como contract_public_uuid en RabbitMQ."
              />
            </s-stack>
          </s-section>

          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              type="submit"
              {...(isSaving ? { loading: true } : {})}
            >
              Guardar
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
