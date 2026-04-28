import type { CustomerDastMetafields } from "./customer.service";

// Shopify customer webhook payload (subset of fields used)
export interface ShopifyCustomerPayload {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  addresses: Array<{
    id: number;
    first_name: string;
    last_name: string;
    company: string | null;
    address1: string;
    address2: string | null;
    city: string;
    zip: string;
    province: string | null;
    country_code: string;
    phone: string | null;
    name: string;
  }>;
}

// DAST format published to RabbitMQ
export interface DastCustomerPayload {
  customer_shop_id: number;
  contract_public_uuid: string;
  public_id: string;
  name: string;
  email: string;
  telephone: string;
  /** Omitido si no hay dirección con CP (evita validación fallida en portal). */
  zip_code?: string;
  country_code: string;
  document_type: number;
  gender: number;
  birth_date: string;
  is_guest: boolean;
  routing_key: "customer.created" | "customer.modified";
  /** Presente en `customer.modified` (portal DAST). */
  updated?: 1;
}

export function transformShopifyCustomerToDast(
  payload: ShopifyCustomerPayload,
  metafields: CustomerDastMetafields,
  routingKey: "customer.created" | "customer.modified"
): DastCustomerPayload {
  const primaryAddress = payload.addresses?.[0];
  const zipTrimmed = (primaryAddress?.zip ?? "").trim();

  const base: DastCustomerPayload = {
    customer_shop_id: payload.id,
    contract_public_uuid: metafields.contract_public_uuid,
    public_id: metafields.public_id,
    name: `${payload.first_name ?? ""} ${payload.last_name ?? ""}`.trim(),
    email: payload.email ?? "",
    telephone: metafields.telephone || payload.phone || "",
    country_code: "ES",
    document_type: metafields.document_type,
    gender: metafields.gender,
    birth_date: metafields.birth_date,
    is_guest: false,
    routing_key: routingKey,
  };

  if (zipTrimmed) {
    base.zip_code = zipTrimmed;
  }

  if (routingKey === "customer.modified") {
    base.updated = 1;
  }

  return base;
}
