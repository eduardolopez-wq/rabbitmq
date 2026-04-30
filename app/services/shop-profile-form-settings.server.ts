import prisma from "../db.server";

export type ShopProfileFormFormValues = {
  profileFormEnablePortugal: boolean;
  updatedAt: string;
};

export async function getProfileFormSettingsForShop(
  shop: string
): Promise<ShopProfileFormFormValues | null> {
  const row = await prisma.shopProfileFormSettings.findUnique({
    where: { shop },
  });
  if (!row) {
    return null;
  }
  return {
    profileFormEnablePortugal: row.profileFormEnablePortugal,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Para API pública / extensiones: si no hay fila, equivale a solo España. */
export async function getProfileFormEnablePortugalForShop(
  shop: string
): Promise<boolean> {
  const row = await prisma.shopProfileFormSettings.findUnique({
    where: { shop },
    select: { profileFormEnablePortugal: true },
  });
  return row?.profileFormEnablePortugal ?? false;
}
