import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { transformOrderToDast, type ShopifyOrderPayload } from "../services/order.transformer";
import { publishForShop } from "../services/rabbitmq.server";
import { loadDastMetafieldsForPublish } from "../services/dast-publish-gate.server";
import { resolveOrderAddressIds } from "../services/order.service";
import { buildAmqpHeaders } from "../services/rabbitmq.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const order = payload as ShopifyOrderPayload;

  setImmediate(async () => {
    try {
      console.log(`[Webhook] Processing order ID: ${order.id} | order_number: ${order.order_number}`);

      if (!admin) {
        console.warn("[Webhook] No admin session — skipping order publish for shop:", shop);
        return;
      }

      if (!order.customer?.id) {
        console.warn("[Webhook] Order has no customer, skipping publish. Order:", order.id);
        return;
      }

      const [metafields, { deliveryAddressId, invoiceAddressId }] = await Promise.all([
        loadDastMetafieldsForPublish(admin, order.customer.id, shop),
        resolveOrderAddressIds(
          admin,
          order.customer.id,
          order.shipping_address ?? order.billing_address ?? null,
          order.billing_address ?? order.shipping_address ?? null
        ),
      ]);

      const dastPayload = transformOrderToDast(
        order,
        metafields,
        deliveryAddressId,
        invoiceAddressId
      );

      console.log("[Webhook] Transformed order DAST payload:", JSON.stringify(dastPayload, null, 2));

      const hasPartner = dastPayload.partner_uuid !== null && dastPayload.partner_uuid !== "";
      const headers = buildAmqpHeaders("order.created", "shopify", hasPartner);

      await publishForShop(shop, "order.created", dastPayload, headers);
      console.log("[Webhook] Successfully published order.created for shop:", shop);
    } catch (err) {
      const e = err as Error;
      console.error("[Webhook] Error processing orders/paid:", e.message, e.stack ?? "");
    }
  });

  return new Response(null, { status: 200 });
};
