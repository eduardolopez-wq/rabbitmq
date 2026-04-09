import amqp from "amqplib";

const EXCHANGE = "ecommerce.events";
const EXCHANGE_TYPE = "topic";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://desarrollo:desarrollo@localhost:5672";
const RECONNECT_DELAY_MS = 5000;
const PUBLISH_RETRY_DELAY_MS = 2000;
const PUBLISH_MAX_ATTEMPTS = 8;

type AmqpConnection = {
  createChannel: () => Promise<amqp.Channel>;
  on: (ev: string, fn: (err: Error) => void) => void;
};

let connection: AmqpConnection | null = null;
let channel: amqp.Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight: Promise<void> | null = null;

function scheduleReconnect(): void {
  connection = null;
  channel = null;
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch(() => {});
  }, RECONNECT_DELAY_MS);
}

async function connect(): Promise<void> {
  if (channel) {
    return;
  }
  if (connectInFlight) {
    await connectInFlight;
    return;
  }

  connectInFlight = (async () => {
    try {
      console.log("[RabbitMQ] Connecting to", RABBITMQ_URL);
      const conn = (await amqp.connect(RABBITMQ_URL)) as unknown as AmqpConnection;
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      connection = conn;
      channel = ch;
      console.log("[RabbitMQ] Connected and exchange asserted:", EXCHANGE);

      conn.on("error", (err) => {
        console.error("[RabbitMQ] Connection error:", err.message);
        scheduleReconnect();
      });

      conn.on("close", () => {
        console.warn("[RabbitMQ] Connection closed. Reconnecting...");
        scheduleReconnect();
      });
    } catch (err) {
      console.error("[RabbitMQ] Failed to connect:", (err as Error).message);
      scheduleReconnect();
    }
  })();

  try {
    await connectInFlight;
  } finally {
    connectInFlight = null;
  }
}

export async function publish(routingKey: string, payload: object): Promise<void> {
  const message = Buffer.from(JSON.stringify(payload));

  for (let attempt = 1; attempt <= PUBLISH_MAX_ATTEMPTS; attempt++) {
    await connect();

    if (!channel) {
      console.warn(
        "[RabbitMQ] No channel (attempt",
        attempt,
        "/",
        PUBLISH_MAX_ATTEMPTS,
        "). Esperando reconexión…"
      );
      await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
      continue;
    }

    const sent = channel.publish(EXCHANGE, routingKey, message, {
      persistent: true,
      contentType: "application/json",
    });

    if (sent) {
      console.log("[RabbitMQ] Published to exchange:", EXCHANGE, "| routing key:", routingKey);
      return;
    }

    console.warn("[RabbitMQ] publish() devolvió false (buffer lleno?), reintentando…");
    await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
  }

  throw new Error(
    `[RabbitMQ] No se pudo publicar tras ${PUBLISH_MAX_ATTEMPTS} intentos. ¿Está RabbitMQ en marcha y RABBITMQ_URL correcto?`
  );
}

void connect();
