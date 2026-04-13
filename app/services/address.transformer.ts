import type { CustomerDastMetafields } from "./customer.service";

export interface ShopifyAddress {
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
}

export interface ShopifyCustomerForAddress {
  id: number;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
}

export interface DastAddressPayload {
  contract_public_uuid: string;
  address_shop_id: number;
  customer_shop_id: number;
  alias: string;
  company: string;
  firstname: string;
  lastname: string;
  address1: string;
  address2: string;
  zip_code: string;
  city: string;
  country_code: string;
  state: string;
  phone: string;
  phone_mobile: string;
  other: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  customer_dni: string;
  customer_vat_number: string;
  is_guest: number;
  routing_key: string;
}

export function transformAddressToDast(
  address: ShopifyAddress,
  customer: ShopifyCustomerForAddress,
  metafields: CustomerDastMetafields,
  routingKey: "address.created" | "address.modified"
): DastAddressPayload {
  const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();

  return {
    contract_public_uuid: metafields.contract_public_uuid ?? "",
    address_shop_id: address.id,
    customer_shop_id: customer.id,
    alias: address.name ?? "",
    company: address.company ?? "",
    firstname: address.first_name ?? "",
    lastname: address.last_name ?? "",
    address1: address.address1 ?? "",
    address2: address.address2 ?? "",
    zip_code: address.zip ?? "",
    city: address.city ?? "",
    country_code: metafields.country_code || address.country_code || "",
    state: address.province ?? "",
    phone: address.phone ?? customer.phone ?? "",
    phone_mobile: "",
    other: "",
    customer_email: customer.email ?? "",
    customer_name: customerName,
    customer_phone: customer.phone ?? "",
    customer_dni: metafields.public_id ?? "",
    customer_vat_number: metafields.public_id ?? "",
    is_guest: 0,
    routing_key: routingKey,
  };
}
