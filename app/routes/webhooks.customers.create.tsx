import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { transformShopifyCustomerToDast, type ShopifyCustomerPayload } from "../services/customer.transformer";
import { publishForShop } from "../services/rabbitmq.server";
import { isDastProfileComplete, loadDastMetafieldsForPublish } from "../services/dast-publish-gate.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const customer = payload as ShopifyCustomerPayload;

  setImmediate(async () => {
    try {
      console.log(`[Webhook] Processing customer ID: ${customer.id}`);

      if (!admin) {
        console.warn("[Webhook] No admin session — cannot fetch metafields, skipping publish for shop:", shop);
        return;
      }

      const metafields = await loadDastMetafieldsForPublish(admin, customer.id);

      if (!isDastProfileComplete(metafields)) {
        console.log(
          "[Webhook] Skipping publish on customers/create — DAST incomplete (normal hasta que el cliente complete el perfil). customer:",
          customer.id
        );
        return;
      }

      const dastPayload = transformShopifyCustomerToDast(customer, metafields, "customer.created");
      console.log("[Webhook] Transformed DAST payload:", JSON.stringify(dastPayload, null, 2));

      await publishForShop(shop, "customer.created", dastPayload);
      console.log("[Webhook] Successfully published customer.created for shop:", shop);
    } catch (err) {
      const e = err as Error;
      console.error("[Webhook] Error processing customer.created:", e.message, e.stack ?? "");
    }
  });

  return new Response(null, { status: 200 });
};
