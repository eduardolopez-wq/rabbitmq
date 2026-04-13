# RabbitMQ Portal — Shopify App

Shopify app embebida que escucha eventos de clientes (`customers/create`, `customers/update`) y los publica a un exchange de RabbitMQ en formato DAST, sirviendo como puente de integración entre Shopify y el portal de VivoFácil.

## Arquitectura

```
Shopify Webhook
  └─► webhooks.customers.create / .update
        └─► dast-publish-gate (valida perfil completo)
              └─► customer.service (fetcha metafields vía Admin GraphQL)
                    └─► customer.transformer (mapea a formato DAST)
                          └─► rabbitmq.server → exchange: ecommerce.events
                                                routing key: customer.created
```

## Flujo de publicación

1. Shopify dispara `customers/create` o `customers/update`.
2. El webhook responde `200` inmediatamente y procesa en `setImmediate` para no bloquear.
3. Se leen los metafields DAST del cliente vía Admin GraphQL (con un reintento a 2s para cubrir la carrera entre el webhook y la escritura de metafields).
4. Si el perfil DAST está incompleto (`public_id`, `document_type ≥ 1`, `gender ≥ 1`, `birth_date` requeridos), se omite la publicación.
5. El payload se transforma al formato DAST y se publica al exchange `ecommerce.events` con routing key `customer.created`.

## Metafields DAST

Los metafields se leen priorizando el namespace de la app (`app--*`) sobre `custom.*` (definiciones manuales legacy):

| Key                  | Tipo   | Descripción                        |
| -------------------- | ------ | ---------------------------------- |
| `dast_public_id`     | String | ID público del cliente en DAST     |
| `dast_document_type` | Int    | Tipo de documento (≥ 1 requerido)  |
| `dast_gender`        | Int    | Género (≥ 1 requerido)             |
| `dast_birth_date`    | String | Fecha de nacimiento                |
| `dast_telephone`     | String | Teléfono (fallback: `dast_phone`)  |
| `dast_country_code`  | String | `ES` o `PT` (fallback: dirección)  |
| `dast_contract_uuid` | String | UUID del contrato                  |

## Extensión UI

`extensions/customer-profile-fields` es una UI Extension que se renderiza en `customer-account.profile.block.render`, permitiendo al cliente completar su perfil DAST directamente desde su cuenta de Shopify.

## Variables de entorno

| Variable        | Default                                          | Descripción              |
| --------------- | ------------------------------------------------ | ------------------------ |
| `RABBITMQ_URL`  | `amqp://desarrollo:desarrollo@localhost:5672`    | URL de conexión AMQP     |
| `DATABASE_URL`  | `file:dev.sqlite`                                | Base de datos Prisma     |

## Desarrollo local

### Requisitos

- Node.js 18+
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- RabbitMQ corriendo localmente (o accesible vía `RABBITMQ_URL`)

### Setup

```shell
npm install
npm run setup        # crea la base de datos SQLite con Prisma
```

### Levantar la app

```shell
shopify app dev
```

Presiona `P` para abrir la URL de la app e instalarla en tu tienda de desarrollo.

### RabbitMQ local con Docker

```shell
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=desarrollo \
  -e RABBITMQ_DEFAULT_PASS=desarrollo \
  rabbitmq:3-management
```

Panel de administración: http://localhost:15672

## Build

```shell
npm run build
```

## Estructura del proyecto

```
app/
├── routes/
│   ├── webhooks.customers.create.tsx   # Webhook customers/create
│   ├── webhooks.customers.update.tsx   # Webhook customers/update
│   └── app._index.tsx                  # UI principal embebida
├── services/
│   ├── rabbitmq.server.ts              # Conexión y publicación AMQP
│   ├── customer.service.ts             # Fetch de metafields vía GraphQL
│   ├── customer.transformer.ts         # Mapeo Shopify → DAST
│   └── dast-publish-gate.server.ts     # Validación de perfil completo
extensions/
└── customer-profile-fields/            # UI Extension en Customer Account
prisma/
└── schema.prisma                       # Modelo de sesiones (SQLite)
```

## RabbitMQ — comportamiento de reconexión

El cliente AMQP mantiene una conexión persistente con reconexión automática:
- Reintento cada **5 segundos** ante cierre o error de conexión.
- Hasta **8 intentos** de publicación con espera de **2 segundos** entre intentos si el canal no está disponible.
- El exchange `ecommerce.events` es de tipo `topic` y durable.
