import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchCustomerDastMetafields } from "../services/customer.service";
import { transformShopifyCustomerToDast, type ShopifyCustomerPayload } from "../services/customer.transformer";
import { publish } from "../services/rabbitmq.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const customer = payload as ShopifyCustomerPayload;

  // Respond 200 immediately — do not block Shopify
  setImmediate(async () => {
    try {
      console.log(`[Webhook] Processing customer ID: ${customer.id}`);

      // Always fetch metafields from the Admin API — never rely on the webhook payload
      const metafields = await fetchCustomerDastMetafields(admin, customer.id);

      const dastPayload = transformShopifyCustomerToDast(customer, metafields);
      console.log("[Webhook] Transformed DAST payload:", JSON.stringify(dastPayload, null, 2));

      await publish("customer.created", dastPayload);
      console.log("[Webhook] Successfully published customer.created for shop:", shop);
    } catch (err) {
      console.error("[Webhook] Error processing customer.created:", (err as Error).message);
    }
  });

  return new Response(null, { status: 200 });
};
