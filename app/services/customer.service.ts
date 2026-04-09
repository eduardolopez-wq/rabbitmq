import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const CUSTOMER_ALL_METAFIELDS_QUERY = `#graphql
  query getCustomerAllMetafields($customerId: ID!) {
    customer(id: $customerId) {
      id
      metafields(first: 100) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
    }
  }
`;

interface MetafieldEdge {
  node?: {
    namespace?: string;
    key?: string;
    value?: string;
  };
}

export interface CustomerDastMetafields {
  contract_public_uuid: string;
  public_id: string;
  document_type: number;
  gender: number;
  birth_date: string;
  telephone: string;
  country_code: string;
}

function getMetafieldValue(
  edges: MetafieldEdge[],
  key: string,
  namespaceMatcher?: (namespace: string) => boolean
): string {
  const edge = edges.find((item) => {
    const namespace = item.node?.namespace ?? "";
    const currentKey = item.node?.key ?? "";
    if (currentKey !== key) {
      return false;
    }
    return namespaceMatcher ? namespaceMatcher(namespace) : true;
  });

  return edge?.node?.value ?? "";
}

/** Prefer app-owned namespace (app--*), then merchant custom.* (legacy manual definitions). */
function getDastMetafieldValue(edges: MetafieldEdge[], key: string): string {
  const fromApp = getMetafieldValue(edges, key, (ns) => ns.startsWith("app--"));
  if (fromApp) {
    return fromApp;
  }
  return getMetafieldValue(edges, key, (ns) => ns === "custom");
}

/** Teléfono: app `dast_telephone` o Admin `custom.dast_phone`. */
function getTelephoneFromEdges(edges: MetafieldEdge[]): string {
  const fromApp = getDastMetafieldValue(edges, "dast_telephone").trim();
  if (fromApp) {
    return fromApp;
  }
  return getMetafieldValue(edges, "dast_phone", (ns) => ns === "custom").trim();
}

/**
 * País: app `dast_country_code` o Admin `custom.dast_country`.
 * Texto: ES/PT. Listas numéricas en Admin: depende del orden de opciones; aquí 0=PT, 1=ES (Portugal primero).
 */
function normalizeDastCountryValue(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return "";
  }
  const up = t.toUpperCase();
  if (up === "ES" || up === "PT") {
    return up;
  }
  if (t === "0") {
    return "PT";
  }
  if (t === "1") {
    return "ES";
  }
  return "";
}

function getCountryCodeFromEdges(edges: MetafieldEdge[]): string {
  const fromApp = getDastMetafieldValue(edges, "dast_country_code").trim().toUpperCase();
  if (fromApp === "ES" || fromApp === "PT") {
    return fromApp;
  }
  const customRaw = getMetafieldValue(edges, "dast_country", (ns) => ns === "custom");
  return normalizeDastCountryValue(customRaw);
}

export async function fetchCustomerDastMetafields(
  admin: AdminApiContext,
  customerId: number
): Promise<CustomerDastMetafields> {
  const gid = `gid://shopify/Customer/${customerId}`;

  console.log("[CustomerService] Fetching metafields for customer:", gid);

  // Diagnóstico: listar todos los metafields para detectar namespace real
  const diagResponse = await admin.graphql(CUSTOMER_ALL_METAFIELDS_QUERY, {
    variables: { customerId: gid },
  });
  const diagJson = (await diagResponse.json()) as {
    data?: { customer?: { metafields?: { edges: MetafieldEdge[] } } };
    errors?: unknown[];
  };
  if (diagJson.errors?.length) {
    console.error("[CustomerService] GraphQL errors:", JSON.stringify(diagJson.errors, null, 2));
  }
  if (!diagJson.data?.customer) {
    console.warn("[CustomerService] No customer in GraphQL response for:", gid);
  }
  const allMetafields = (diagJson.data?.customer?.metafields?.edges ?? []) as MetafieldEdge[];
  console.log("[CustomerService] ALL metafields:", JSON.stringify(allMetafields, null, 2));
  const metafields: CustomerDastMetafields = {
    contract_public_uuid: getMetafieldValue(allMetafields, "dast_contract_uuid", (namespace) => namespace === "custom"),
    public_id: getDastMetafieldValue(allMetafields, "dast_public_id"),
    document_type: parseInt(getDastMetafieldValue(allMetafields, "dast_document_type") || "0", 10),
    gender: parseInt(getDastMetafieldValue(allMetafields, "dast_gender") || "0", 10),
    birth_date: getDastMetafieldValue(allMetafields, "dast_birth_date"),
    telephone: getTelephoneFromEdges(allMetafields),
    country_code: getCountryCodeFromEdges(allMetafields),
  };

  console.log("[CustomerService] Metafields retrieved:", metafields);
  return metafields;
}
