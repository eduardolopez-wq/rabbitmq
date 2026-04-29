import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Lee configuración del formulario cuenta cliente para la UI extension (Customer Account).
 * Autenticación: JWT de sesión emitido por Shopify (`authenticate.public.customerAccount`).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors, sessionToken } = await authenticate.public.customerAccount(request);
  const dest = typeof sessionToken.dest === "string" ? sessionToken.dest : "";
  const shop = dest.replace(/^https:\/\//, "");

  const row = await prisma.shopIntegrationSettings.findUnique({
    where: { shop },
  });

  const payload = JSON.stringify({
    enablePortugal: Boolean(
      (row as { profileFormEnablePortugal?: boolean }).profileFormEnablePortugal ?? false
    ),
  });
  return cors(
    new Response(payload, {
      headers: { "Content-Type": "application/json" },
    })
  );
};
