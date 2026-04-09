import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const CUSTOMER_ALL_METAFIELDS_QUERY = `#graphql
  query getCustomerAllMetafields($customerId: ID!) {
    customer(id: $customerId) {
      id
      metafields(first: 20) {
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

export async function fetchCustomerDastMetafields(
  admin: AdminApiContext["admin"],
  customerId: number
): Promise<CustomerDastMetafields> {
  const gid = `gid://shopify/Customer/${customerId}`;

  console.log("[CustomerService] Fetching metafields for customer:", gid);

  // Diagnóstico: listar todos los metafields para detectar namespace real
  const diagResponse = await admin.graphql(CUSTOMER_ALL_METAFIELDS_QUERY, {
    variables: { customerId: gid },
  });
  const diagJson = await diagResponse.json();
  const allMetafields = (diagJson?.data?.customer?.metafields?.edges ?? []) as MetafieldEdge[];
  console.log("[CustomerService] ALL metafields:", JSON.stringify(allMetafields, null, 2));
  const appNamespaceMatcher = (namespace: string) => namespace.startsWith("app--");

  const metafields: CustomerDastMetafields = {
    contract_public_uuid: getMetafieldValue(allMetafields, "dast_contract_uuid", (namespace) => namespace === "custom"),
    public_id: getMetafieldValue(allMetafields, "dast_public_id", appNamespaceMatcher),
    document_type: parseInt(getMetafieldValue(allMetafields, "dast_document_type", appNamespaceMatcher) || "0", 10),
    gender: parseInt(getMetafieldValue(allMetafields, "dast_gender", appNamespaceMatcher) || "0", 10),
    birth_date: getMetafieldValue(allMetafields, "dast_birth_date", appNamespaceMatcher),
    telephone: getMetafieldValue(allMetafields, "dast_telephone", appNamespaceMatcher),
    country_code: getMetafieldValue(allMetafields, "dast_country_code", appNamespaceMatcher).toUpperCase(),
  };

  console.log("[CustomerService] Metafields retrieved:", metafields);
  return metafields;
}
