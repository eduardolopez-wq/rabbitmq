import amqp from "amqplib";
import { getAmqpUrlForShop } from "./shop-settings.server";

const EXCHANGE = "ecommerce.events";
const EXCHANGE_TYPE = "topic";
const RECONNECT_DELAY_MS = 5000;
const PUBLISH_RETRY_DELAY_MS = 2000;
const PUBLISH_MAX_ATTEMPTS = 8;

type AmqpConnection = {
  createChannel: () => Promise<amqp.Channel>;
  on: (ev: string, fn: (err: Error) => void) => void;
};

type ConnectionState = {
  amqpUrl: string;
  connection: AmqpConnection | null;
  channel: amqp.Channel | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectInFlight: Promise<void> | null;
};

const states = new Map<string, ConnectionState>();

function getState(amqpUrl: string): ConnectionState {
  let s = states.get(amqpUrl);
  if (!s) {
    s = {
      amqpUrl,
      connection: null,
      channel: null,
      reconnectTimer: null,
      connectInFlight: null,
    };
    states.set(amqpUrl, s);
  }
  return s;
}

function logAmqpTarget(amqpUrl: string): string {
  try {
    const u = new URL(amqpUrl);
    return `${u.hostname}:${u.port || "5672"}${u.pathname}`;
  } catch {
    return "(url no válida)";
  }
}

function scheduleReconnect(amqpUrl: string): void {
  const s = getState(amqpUrl);
  s.connection = null;
  s.channel = null;
  if (s.reconnectTimer) {
    return;
  }
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null;
    connect(amqpUrl).catch(() => {});
  }, RECONNECT_DELAY_MS);
}

async function connect(amqpUrl: string): Promise<void> {
  const s = getState(amqpUrl);
  if (s.channel) {
    return;
  }
  if (s.connectInFlight) {
    await s.connectInFlight;
    return;
  }

  s.connectInFlight = (async () => {
    try {
      console.log("[RabbitMQ] Conectando a", logAmqpTarget(amqpUrl));
      const conn = (await amqp.connect(amqpUrl)) as unknown as AmqpConnection;
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      s.connection = conn;
      s.channel = ch;
      console.log("[RabbitMQ] Conectado; exchange:", EXCHANGE);

      conn.on("error", (err) => {
        console.error("[RabbitMQ] Error de conexión:", err.message);
        scheduleReconnect(amqpUrl);
      });

      conn.on("close", () => {
        console.warn("[RabbitMQ] Conexión cerrada. Reconectando…");
        scheduleReconnect(amqpUrl);
      });
    } catch (err) {
      console.error("[RabbitMQ] Fallo al conectar:", (err as Error).message);
      scheduleReconnect(amqpUrl);
    }
  })();

  try {
    await s.connectInFlight;
  } finally {
    s.connectInFlight = null;
  }
}

export async function publishForUrl(
  amqpUrl: string,
  routingKey: string,
  payload: object
): Promise<void> {
  const message = Buffer.from(JSON.stringify(payload));

  for (let attempt = 1; attempt <= PUBLISH_MAX_ATTEMPTS; attempt++) {
    await connect(amqpUrl);

    const s = getState(amqpUrl);
    if (!s.channel) {
      console.warn(
        "[RabbitMQ] Sin canal (intento",
        attempt,
        "/",
        PUBLISH_MAX_ATTEMPTS,
        "). Esperando reconexión…"
      );
      await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
      continue;
    }

    const sent = s.channel.publish(EXCHANGE, routingKey, message, {
      persistent: true,
      contentType: "application/json",
    });

    if (sent) {
      console.log("[RabbitMQ] Publicado en", EXCHANGE, "| routing key:", routingKey);
      return;
    }

    console.warn("[RabbitMQ] publish() devolvió false (buffer lleno?), reintentando…");
    await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
  }

  throw new Error(
    `[RabbitMQ] No se pudo publicar tras ${PUBLISH_MAX_ATTEMPTS} intentos. ¿RabbitMQ en marcha y datos correctos?`
  );
}

export async function publishForShop(
  shop: string,
  routingKey: string,
  payload: object
): Promise<void> {
  const url = await getAmqpUrlForShop(shop);
  return publishForUrl(url, routingKey, payload);
}
