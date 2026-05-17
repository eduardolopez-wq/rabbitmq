import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ShopifyOrderAddress } from "./order.transformer";

const CUSTOMER_ADDRESSES_QUERY = `#graphql
  query getCustomerAddresses($customerId: ID!) {
    customer(id: $customerId) {
      addressesV2(first: 50) {
        edges {
          node {
            id
            address1
            address2
            city
            zip
            province
            countryCodeV2
            phone
            firstName
            lastName
            name
          }
        }
      }
    }
  }
`;

interface CustomerAddressNode {
  id: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zip: string | null;
  province: string | null;
  countryCodeV2: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

export interface ResolvedAddressIds {
  deliveryAddressId: number;
  invoiceAddressId: number;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Extrae el ID numérico de un GID de Shopify: gid://shopify/MailingAddress/123456789 → 123456789 */
function extractNumericIdFromGid(gid: string): number {
  const match = gid.match(/\/(\d+)(\?.*)?$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Puntúa la similitud entre una dirección guardada y una dirección de la orden.
 * address1 + zip son los campos clave; city es desempate.
 */
function scoreAddressMatch(saved: CustomerAddressNode, order: ShopifyOrderAddress): number {
  let score = 0;
  if (normalize(saved.address1) === normalize(order.address1)) score += 3;
  if (normalize(saved.zip) === normalize(order.zip)) score += 2;
  if (normalize(saved.city) === normalize(order.city)) score += 1;
  return score;
}

function findBestMatch(
  addresses: CustomerAddressNode[],
  target: ShopifyOrderAddress | null,
  label: string
): number {
  if (!target || addresses.length === 0) {
    return 0;
  }

  let bestMatch: CustomerAddressNode | null = null;
  let bestScore = 0;

  for (const addr of addresses) {
    const score = scoreAddressMatch(addr, target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = addr;
    }
  }

  // Mínimo score 2: address1 + zip deben coincidir para ser confiable
  if (!bestMatch || bestScore < 2) {
    console.warn(
      `[OrderService] Sin coincidencia confiable para ${label} (mejor score: ${bestScore}). address_shop_id = 0`
    );
    return 0;
  }

  const numericId = extractNumericIdFromGid(bestMatch.id);
  console.log(
    `[OrderService] ${label} resuelta → ID: ${numericId} | score: ${bestScore} | address1: "${bestMatch.address1}" | zip: "${bestMatch.zip}"`
  );
  return numericId;
}

/**
 * Consulta la Admin API UNA sola vez y resuelve los IDs numéricos de
 * la dirección de envío (delivery) y la dirección de facturación (invoice).
 */
export async function resolveOrderAddressIds(
  admin: AdminApiContext,
  customerId: number,
  shippingAddress: ShopifyOrderAddress | null,
  billingAddress: ShopifyOrderAddress | null
): Promise<ResolvedAddressIds> {
  const customerGid = `gid://shopify/Customer/${customerId}`;

  try {
    const response = await admin.graphql(CUSTOMER_ADDRESSES_QUERY, {
      variables: { customerId: customerGid },
    });

    const json = (await response.json()) as {
      data?: {
        customer?: {
          addressesV2?: { edges: { node: CustomerAddressNode }[] };
        };
      };
      errors?: unknown[];
    };

    if (json.errors?.length) {
      console.error(
        "[OrderService] GraphQL errors al obtener direcciones:",
        JSON.stringify(json.errors, null, 2)
      );
      return { deliveryAddressId: 0, invoiceAddressId: 0 };
    }

    const addresses = (json.data?.customer?.addressesV2?.edges ?? []).map((e) => e.node);
    console.log(
      `[OrderService] ${addresses.length} dirección(es) encontradas para customer ${customerId}`
    );

    const deliveryAddressId = findBestMatch(addresses, shippingAddress, "delivery_address");

    // Si la dirección de facturación es igual a la de envío, reutiliza el mismo ID
    const billingIsSameAsShipping =
      billingAddress &&
      shippingAddress &&
      normalize(billingAddress.address1) === normalize(shippingAddress.address1) &&
      normalize(billingAddress.zip) === normalize(shippingAddress.zip);

    const invoiceAddressId = billingIsSameAsShipping
      ? deliveryAddressId
      : findBestMatch(addresses, billingAddress, "invoice_address");

    return { deliveryAddressId, invoiceAddressId };
  } catch (err) {
    const e = err as Error;
    console.error("[OrderService] Error consultando direcciones del cliente:", e.message);
    return { deliveryAddressId: 0, invoiceAddressId: 0 };
  }
}
