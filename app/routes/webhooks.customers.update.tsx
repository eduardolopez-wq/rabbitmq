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
      console.log(`[Webhook] Processing customer update ID: ${customer.id}`);

      const metafields = await fetchCustomerDastMetafields(admin, customer.id);

      // Only publish if all required DAST fields are present
      if (
        !metafields.public_id ||
        !metafields.document_type ||
        !metafields.gender ||
        !metafields.birth_date ||
        !metafields.telephone ||
        !metafields.country_code
      ) {
        console.log("[Webhook] Skipping publish — DAST metafields incomplete for customer:", customer.id);
        return;
      }

      const dastPayload = transformShopifyCustomerToDast(customer, metafields);
      console.log("[Webhook] Transformed DAST payload:", JSON.stringify(dastPayload, null, 2));

      await publish("customer.created", dastPayload);
      console.log("[Webhook] Successfully published customer.created (update) for shop:", shop);
    } catch (err) {
      console.error("[Webhook] Error processing customer.update:", (err as Error).message);
    }
  });

  return new Response(null, { status: 200 });
};
