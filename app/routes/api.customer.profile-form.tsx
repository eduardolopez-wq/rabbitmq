import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getProfileFormEnablePortugalForShop } from "../services/shop-profile-form-settings.server";

/**
 * Lee configuración del formulario cuenta cliente para la UI extension (Customer Account).
 * Autenticación: JWT de sesión emitido por Shopify (`authenticate.public.customerAccount`).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors, sessionToken } = await authenticate.public.customerAccount(request);
  const dest = typeof sessionToken.dest === "string" ? sessionToken.dest : "";
  const shop = dest.replace(/^https:\/\//, "");

  const enablePortugal = await getProfileFormEnablePortugalForShop(shop);

  const payload = JSON.stringify({
    enablePortugal,
  });
  return cors(
    new Response(payload, {
      headers: { "Content-Type": "application/json" },
    })
  );
};
