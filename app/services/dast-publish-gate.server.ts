import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { fetchCustomerDastMetafields, type CustomerDastMetafields } from "./customer.service";
import { getShopPdsContractUuid } from "./shop-settings.server";

async function applyShopContractFallback(
  shop: string,
  metafields: CustomerDastMetafields
): Promise<CustomerDastMetafields> {
  if (metafields.contract_public_uuid?.trim()) {
    return metafields;
  }
  const fromSettings = await getShopPdsContractUuid(shop);
  if (!fromSettings) {
    return metafields;
  }
  return { ...metafields, contract_public_uuid: fromSettings };
}

/** Perfil DAST listo para publicar al portal (misma regla en create y update). */
export function isDastProfileComplete(metafields: CustomerDastMetafields): boolean {
  const documentOk = Number.isFinite(metafields.document_type) && metafields.document_type >= 1;
  const genderOk = Number.isFinite(metafields.gender) && metafields.gender >= 1;
  return (
    !!metafields.public_id?.trim() &&
    documentOk &&
    genderOk &&
    !!metafields.birth_date?.trim()
  );
}

/** Primera lectura + reintento a 2s por carrera Admin API vs webhook. */
export async function loadDastMetafieldsForPublish(
  admin: AdminApiContext,
  customerId: number,
  shop: string
): Promise<CustomerDastMetafields> {
  let metafields = await fetchCustomerDastMetafields(admin, customerId);
  metafields = await applyShopContractFallback(shop, metafields);
  if (!isDastProfileComplete(metafields)) {
    await new Promise((r) => setTimeout(r, 2000));
    metafields = await fetchCustomerDastMetafields(admin, customerId);
    metafields = await applyShopContractFallback(shop, metafields);
  }
  return metafields;
}
