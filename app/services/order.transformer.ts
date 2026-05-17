import type { CustomerDastMetafields } from "./customer.service";

// ─── Shopify webhook payload types ───────────────────────────────────────────

export interface ShopifyOrderAddress {
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

export interface ShopifyOrderTaxLine {
  rate: number;
  price: string;
  title: string;
}

export interface ShopifyOrderLineItem {
  id: number;
  title: string;
  sku: string | null;
  quantity: number;
  price: string;
  product_id: number | null;
  variant_id: number | null;
  tax_lines: ShopifyOrderTaxLine[];
}

export interface ShopifyOrderPayload {
  id: number;
  name: string;
  order_number: number;
  confirmation_number: string | null;
  email: string;
  phone: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  gateway: string | null;
  payment_gateway_names: string[];
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  };
  shipping_address: ShopifyOrderAddress | null;
  billing_address: ShopifyOrderAddress | null;
  line_items: ShopifyOrderLineItem[];
}

// ─── DAST payload types ───────────────────────────────────────────────────────

export interface DastOrderAddress {
  contract_public_uuid: null;
  customer_shop_id: string;
  address_shop_id: number;
  alias: string;
  company: string;
  lastname: string;
  firstname: string;
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
  is_guest: string;
}

export interface DastOrderService {
  order_line_id: string;
  product_id: string;
  product_ref: string;
  product_name: string;
  quantity: string;
  unit_price_tax_included: string;
  total_price_tax_included: string;
  unit_price_tax_excluded: string;
  total_price_tax_excluded: string;
}

export interface DastOrderPayload {
  customer_shop_id: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  customer_dni: string;
  customer_legacy_invoice_dni: string;
  customer_legacy_invoice_vat_number: string;
  customer_legacy_delivery_dni: string;
  customer_legacy_delivery_vat_number: string;
  is_guest: string;
  contract_public_uuid: string;
  order_id: number;
  order_reference: string;
  partner_id: null;
  partner_uuid: null;
  services: DastOrderService[];
  total_tax_included: string;
  total_tax_excluded: string;
  payment_method: string;
  payment_module: string;
  delivery_address: DastOrderAddress;
  invoice_address: DastOrderAddress;
  routing_key: "order.created";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formatea un número a string con 6 decimales, tal como espera el portal. */
function fmt6(value: number): string {
  return value.toFixed(6);
}

/**
 * Calcula el precio sin IVA a partir del precio con IVA y las tax_lines del line item.
 * Si no hay tax_lines, asume precio sin IVA igual al precio con IVA.
 */
function calcTaxExcluded(priceIncluded: number, taxLines: ShopifyOrderTaxLine[]): number {
  const totalRate = taxLines.reduce((sum, t) => sum + t.rate, 0);
  if (totalRate === 0) {
    return priceIncluded;
  }
  return priceIncluded / (1 + totalRate);
}

/** Construye el sub-objeto de dirección (delivery_address / invoice_address). */
function buildDastAddress(
  address: ShopifyOrderAddress | null,
  customer: ShopifyOrderPayload["customer"],
  metafields: CustomerDastMetafields,
  addressShopId: number,
  countryCodeFallback: string
): DastOrderAddress {
  const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
  const addr = address ?? ({} as Partial<ShopifyOrderAddress>);

  return {
    contract_public_uuid: null,
    customer_shop_id: String(customer.id),
    address_shop_id: addressShopId,
    alias: addr.name ?? "",
    company: addr.company ?? "",
    lastname: addr.last_name ?? "",
    firstname: addr.first_name ?? "",
    address1: addr.address1 ?? "",
    address2: addr.address2 ?? "",
    zip_code: addr.zip ?? "",
    city: addr.city ?? "",
    country_code: metafields.country_code || addr.country_code || countryCodeFallback,
    state: addr.province ?? "",
    phone: addr.phone ?? customer.phone ?? "",
    phone_mobile: "",
    other: "",
    customer_email: customer.email ?? "",
    customer_name: customerName,
    customer_phone: customer.phone ?? "",
    customer_dni: metafields.public_id ?? "",
    customer_vat_number: metafields.public_id ?? "",
    is_guest: "0",
  };
}

// ─── Main transform ───────────────────────────────────────────────────────────

export function transformOrderToDast(
  order: ShopifyOrderPayload,
  metafields: CustomerDastMetafields,
  deliveryAddressId: number = 0,
  invoiceAddressId: number = 0
): DastOrderPayload {
  const customer = order.customer;
  const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();

  // contract_public_uuid: PDS API Key de la configuración de la tienda (contrato con el portal).
  // El SKU del producto va en services[].product_ref, no aquí.
  const contractUuid = metafields.contract_public_uuid?.trim() || "";

  console.log("[OrderTransformer] contract_public_uuid:", contractUuid, "| fuente: metafields/PDS API Key");

  // order_reference: confirmation_number (código alfanumérico de checkout) o fallback al name
  const orderReference = order.confirmation_number?.trim() || order.name?.replace(/^#/, "") || "";

  // payment: payment_gateway_names[0] como display name, gateway como módulo técnico
  const gatewayName = (order.payment_gateway_names ?? [])[0] ?? "";
  const paymentModule = order.gateway?.trim() || gatewayName;
  const paymentMethod = gatewayName || (paymentModule ? paymentModule.charAt(0).toUpperCase() + paymentModule.slice(1) : "");

  // totales
  const totalTaxIncluded = parseFloat(order.total_price ?? "0");
  const totalTax = parseFloat(order.total_tax ?? "0");
  const totalTaxExcluded = totalTaxIncluded - totalTax;

  // services: un elemento por cada line item
  const services: DastOrderService[] = (order.line_items ?? []).map((item) => {
    const unitPriceIncluded = parseFloat(item.price ?? "0");
    const unitPriceExcluded = calcTaxExcluded(unitPriceIncluded, item.tax_lines ?? []);
    const qty = item.quantity ?? 1;

    return {
      order_line_id: String(item.id),
      product_id: String(item.product_id ?? ""),
      product_ref: item.sku?.trim() ?? "",
      product_name: item.title ?? "",
      quantity: String(qty),
      unit_price_tax_included: fmt6(unitPriceIncluded),
      total_price_tax_included: fmt6(unitPriceIncluded * qty),
      unit_price_tax_excluded: fmt6(unitPriceExcluded),
      total_price_tax_excluded: fmt6(unitPriceExcluded * qty),
    };
  });

  // Dirección efectiva: shipping tiene prioridad; si no existe, usar billing como fallback
  const effectiveShipping = order.shipping_address ?? order.billing_address;
  const effectiveBilling = order.billing_address ?? order.shipping_address;

  const countryCode =
    metafields.country_code ||
    effectiveShipping?.country_code ||
    effectiveBilling?.country_code ||
    "";

  const deliveryAddress = buildDastAddress(
    effectiveShipping,
    customer,
    metafields,
    deliveryAddressId || invoiceAddressId,
    countryCode
  );

  const invoiceAddress = buildDastAddress(
    effectiveBilling,
    customer,
    metafields,
    invoiceAddressId || deliveryAddressId,
    countryCode
  );

  const dni = metafields.public_id ?? "";

  return {
    customer_shop_id: String(customer.id),
    customer_email: customer.email ?? order.email ?? "",
    customer_name: customerName,
    customer_phone: customer.phone ?? "",
    customer_dni: dni,
    customer_legacy_invoice_dni: dni,
    customer_legacy_invoice_vat_number: dni,
    customer_legacy_delivery_dni: dni,
    customer_legacy_delivery_vat_number: dni,
    is_guest: "0",
    contract_public_uuid: contractUuid,
    order_id: order.order_number ?? order.id,
    order_reference: orderReference,
    partner_id: null,
    partner_uuid: null,
    services,
    total_tax_included: fmt6(totalTaxIncluded),
    total_tax_excluded: fmt6(totalTaxExcluded),
    payment_method: paymentMethod,
    payment_module: paymentModule,
    delivery_address: deliveryAddress,
    invoice_address: invoiceAddress,
    routing_key: "order.created",
  };
}
