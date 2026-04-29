import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const SHOP_ID_QUERY = `#graphql
  query ProfileFormShopId {
    shop {
      id
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation ProfileFormShopMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Replica la opción "Portugal en formulario" en un metafield de tienda para que la UI extension
 * pueda leerla por Customer Account GraphQL (`shop.metafield`).
 */
export async function syncShopProfileFormShopMetafield(
  admin: AdminApiContext,
  enablePortugal: boolean
): Promise<void> {
  const shopResp = await admin.graphql(SHOP_ID_QUERY);
  const shopJson = (await shopResp.json()) as {
    data?: { shop?: { id: string } };
    errors?: { message: string }[];
  };
  if (shopJson.errors?.length) {
    console.warn("[ProfileForm] Shop query errors:", JSON.stringify(shopJson.errors));
    return;
  }
  const shopId = shopJson.data?.shop?.id;
  if (!shopId) {
    console.warn("[ProfileForm] No shop id — metafield sync skipped");
    return;
  }

  const setResp = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: "vivofacil_dast",
          key: "profile_show_portugal",
          type: "boolean",
          value: enablePortugal ? "true" : "false",
        },
      ],
    },
  });
  const setJson = (await setResp.json()) as {
    data?: { metafieldsSet?: { userErrors?: { message: string }[] } };
    errors?: { message: string }[];
  };
  if (setJson.errors?.length) {
    console.warn("[ProfileForm] metafieldsSet GraphQL errors:", JSON.stringify(setJson.errors));
    return;
  }
  const userErrors = setJson.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.warn(
      "[ProfileForm] metafieldsSet userErrors:",
      userErrors.map((e) => e.message).join("; ")
    );
  }
}
