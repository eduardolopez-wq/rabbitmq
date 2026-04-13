import prisma from "../db.server";
import type { CustomerDastMetafields } from "./customer.service";
import type { ShopifyAddress, ShopifyCustomerForAddress } from "./address.transformer";
import { transformAddressToDast } from "./address.transformer";
import { publish } from "./rabbitmq.server";

/**
 * For each address in the webhook payload:
 * - If its ID has never been seen → publish address.created and record it
 * - If already seen → publish address.modified
 */
export async function publishAddressEvents(
  addresses: ShopifyAddress[],
  customer: ShopifyCustomerForAddress,
  metafields: CustomerDastMetafields,
  shop: string
): Promise<void> {
  for (const address of addresses) {
    const addressShopId = BigInt(address.id);
    const customerShopId = BigInt(customer.id);

    const existing = await prisma.seenAddress.findUnique({
      where: { addressShopId_shop: { addressShopId, shop } },
    });

    const routingKey = existing ? "address.modified" : "address.created";

    if (!existing) {
      await prisma.seenAddress.create({
        data: { addressShopId, customerShopId, shop },
      });
    }

    const payload = transformAddressToDast(address, customer, metafields, routingKey);
    await publish(routingKey, payload);
    console.log(`[AddressService] Published ${routingKey} for address ${address.id}, customer ${customer.id}`);
  }
}
