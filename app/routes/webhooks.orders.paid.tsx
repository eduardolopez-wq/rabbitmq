import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { transformOrderToDast, type ShopifyOrderPayload } from "../services/order.transformer";
import { publishForShop } from "../services/rabbitmq.server";
import { loadDastMetafieldsForPublish } from "../services/dast-publish-gate.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const order = payload as ShopifyOrderPayload;

  setImmediate(async () => {
    try {
      console.log(`[Webhook] Processing order ID: ${order.id}`);

      if (!admin) {
        console.warn("[Webhook] No admin session — skipping order publish for shop:", shop);
        return;
      }

      if (!order.customer?.id) {
        console.warn("[Webhook] Order has no customer, skipping publish. Order:", order.id);
        return;
      }

      const metafields = await loadDastMetafieldsForPublish(admin, order.customer.id);
      const dastPayload = transformOrderToDast(order, metafields);

      console.log("[Webhook] Transformed order DAST payload:", JSON.stringify(dastPayload, null, 2));

      await publishForShop(shop, "order.created", dastPayload);
      console.log("[Webhook] Successfully published order.created for shop:", shop);
    } catch (err) {
      const e = err as Error;
      console.error("[Webhook] Error processing orders/paid:", e.message, e.stack ?? "");
    }
  });

  return new Response(null, { status: 200 });
};
