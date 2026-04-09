import amqp from "amqplib";

const EXCHANGE = "ecommerce.events";
const EXCHANGE_TYPE = "topic";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://desarrollo:desarrollo@localhost:5672";
const RECONNECT_DELAY_MS = 5000;

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;

async function connect(): Promise<void> {
  try {
    console.log("[RabbitMQ] Connecting to", RABBITMQ_URL);
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
    console.log("[RabbitMQ] Connected and exchange asserted:", EXCHANGE);

    connection.on("error", (err) => {
      console.error("[RabbitMQ] Connection error:", err.message);
      scheduleReconnect();
    });

    connection.on("close", () => {
      console.warn("[RabbitMQ] Connection closed. Reconnecting...");
      scheduleReconnect();
    });
  } catch (err) {
    console.error("[RabbitMQ] Failed to connect:", (err as Error).message);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  connection = null;
  channel = null;
  setTimeout(() => {
    connect();
  }, RECONNECT_DELAY_MS);
}

export async function publish(routingKey: string, payload: object): Promise<void> {
  if (!channel) {
    console.warn("[RabbitMQ] No channel available. Attempting to reconnect...");
    await connect();
  }

  if (!channel) {
    throw new Error("[RabbitMQ] Unable to publish: channel not available after reconnect attempt.");
  }

  const message = Buffer.from(JSON.stringify(payload));
  channel.publish(EXCHANGE, routingKey, message, {
    persistent: true,
    contentType: "application/json",
  });

  console.log("[RabbitMQ] Published to exchange:", EXCHANGE, "| routing key:", routingKey);
}

// Initialize connection on module load (server-side only)
connect();
