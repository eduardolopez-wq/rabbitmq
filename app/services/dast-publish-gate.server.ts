import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { fetchCustomerDastMetafields, type CustomerDastMetafields } from "./customer.service";

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
  customerId: number
): Promise<CustomerDastMetafields> {
  let metafields = await fetchCustomerDastMetafields(admin, customerId);
  if (!isDastProfileComplete(metafields)) {
    await new Promise((r) => setTimeout(r, 2000));
    metafields = await fetchCustomerDastMetafields(admin, customerId);
  }
  return metafields;
}
