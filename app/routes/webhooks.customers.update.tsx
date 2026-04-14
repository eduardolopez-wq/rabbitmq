import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { transformShopifyCustomerToDast, type ShopifyCustomerPayload } from "../services/customer.transformer";
import { publishForShop } from "../services/rabbitmq.server";
import { isDastProfileComplete, loadDastMetafieldsForPublish } from "../services/dast-publish-gate.server";
import { publishAddressEvents } from "../services/address.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic, shop } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const customer = payload as ShopifyCustomerPayload;

  setImmediate(async () => {
    try {
      console.log(`[Webhook] Processing customer update ID: ${customer.id}`);

      if (!admin) {
        console.warn("[Webhook] No admin session — cannot fetch metafields, skipping publish for shop:", shop);
        return;
      }

      const metafields = await loadDastMetafieldsForPublish(admin, customer.id);

      const primaryAddress = customer.addresses?.[0];
      const effectiveTelephone = (metafields.telephone || customer.phone || "").trim();
      const effectiveCountry = (metafields.country_code || primaryAddress?.country_code || "").trim().toUpperCase();

      if (!isDastProfileComplete(metafields)) {
        console.log("[Webhook] Skipping publish — DAST incomplete for customer:", customer.id, {
          hasPublicId: !!metafields.public_id?.trim(),
          documentOk: Number.isFinite(metafields.document_type) && metafields.document_type >= 1,
          genderOk: Number.isFinite(metafields.gender) && metafields.gender >= 1,
          hasBirthDate: !!metafields.birth_date?.trim(),
          effectiveTelephone: !!effectiveTelephone,
          effectiveCountry: !!effectiveCountry,
        });
        return;
      }

      // Publish customer event
      const dastPayload = transformShopifyCustomerToDast(customer, metafields, "customer.modified");
      console.log("[Webhook] Transformed DAST payload:", JSON.stringify(dastPayload, null, 2));
      await publishForShop(shop, "customer.modified", dastPayload);
      console.log("[Webhook] Successfully published customer.modified for shop:", shop);

      // Publish address events for each address in the payload
      if (customer.addresses?.length) {
        await publishAddressEvents(customer.addresses, customer, metafields, shop);
      }
    } catch (err) {
      const e = err as Error;
      console.error("[Webhook] Error processing customer.update:", e.message, e.stack ?? "");
    }
  });

  return new Response(null, { status: 200 });
};
