import type { ShopIntegrationSettings } from "@prisma/client";
import prisma from "../db.server";

export type ShopSettingsFormValues = {
  rabbitmqHost: string;
  rabbitmqUser: string;
  rabbitmqPort: number;
  rabbitmqVhost: string;
  pdsApiKey: string;
  rabbitmqHasPassword: boolean;
  updatedAt: string;
};

/**
 * Construye la URL AMQP 0-9-1 a partir de los campos del formulario (misma idea que el módulo PrestaShop).
 */
export function buildAmqpConnectionUrl(settings: Pick<
  ShopIntegrationSettings,
  "rabbitmqHost" | "rabbitmqUser" | "rabbitmqPassword" | "rabbitmqPort" | "rabbitmqVhost"
>): string {
  const host = settings.rabbitmqHost.trim();
  if (!host) {
    return "";
  }
  const port = settings.rabbitmqPort > 0 ? settings.rabbitmqPort : 5672;
  const user = encodeURIComponent(settings.rabbitmqUser);
  const pass = encodeURIComponent(settings.rabbitmqPassword);
  const vhost = settings.rabbitmqVhost?.trim() ? settings.rabbitmqVhost : "/";
  const vhostPath = encodeURIComponent(vhost);
  return `amqp://${user}:${pass}@${host}:${port}/${vhostPath}`;
}

const DEFAULT_RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://desarrollo:desarrollo@localhost:5672";

/**
 * URL AMQP a usar para publicar: configuración por tienda si hay host guardado; si no, variable de entorno.
 */
export async function getAmqpUrlForShop(shop: string): Promise<string> {
  const row = await prisma.shopIntegrationSettings.findUnique({
    where: { shop },
  });
  if (row?.rabbitmqHost?.trim()) {
    return buildAmqpConnectionUrl(row);
  }
  return DEFAULT_RABBITMQ_URL;
}

/**
 * UUID de contrato PDS guardado en configuración de la app (campo "PDS API Key").
 * Se usa como `contract_public_uuid` en RabbitMQ si el metafield del cliente está vacío.
 */
export async function getShopPdsContractUuid(shop: string): Promise<string> {
  const row = await prisma.shopIntegrationSettings.findUnique({
    where: { shop },
  });
  return (row?.pdsApiKey ?? "").trim();
}

export async function getShopSettingsForForm(shop: string): Promise<ShopSettingsFormValues | null> {
  const row = await prisma.shopIntegrationSettings.findUnique({
    where: { shop },
  });
  if (!row) {
    return null;
  }
  return {
    rabbitmqHost: row.rabbitmqHost,
    rabbitmqUser: row.rabbitmqUser,
    rabbitmqPort: row.rabbitmqPort,
    rabbitmqVhost: row.rabbitmqVhost,
    pdsApiKey: row.pdsApiKey,
    rabbitmqHasPassword: row.rabbitmqPassword.length > 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}
