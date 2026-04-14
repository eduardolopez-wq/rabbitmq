# Documentación Técnica — RabbitMQ Portal (Shopify App)

## Visión general

Aplicación Shopify embebida construida con **React Router v7** (framework mode) sobre Node.js. Actúa como puente de integración entre Shopify y el portal VivoFácil: escucha webhooks de clientes, valida que el perfil DAST esté completo y publica eventos al exchange `ecommerce.events` de RabbitMQ en formato DAST.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework web | React Router v7 (Remix-compatible) |
| Shopify SDK | `@shopify/shopify-app-react-router` |
| Mensajería | `amqplib` (AMQP 0-9-1) |
| Base de datos | SQLite vía Prisma ORM |
| Lenguaje | TypeScript |
| Build | Vite + esbuild |
| UI Extension | `@shopify/ui-extensions` (Customer Account) |

---

## Arquitectura de flujo

```
Shopify Webhook (HTTPS POST)
  │
  ▼
webhooks.customers.create.tsx  /  webhooks.customers.update.tsx
  │  responde 200 inmediatamente
  │  procesa en setImmediate (no bloquea)
  │
  ▼
dast-publish-gate.server.ts
  │  loadDastMetafieldsForPublish()
  │    └─ fetchCustomerDastMetafields() → Admin GraphQL API
  │    └─ reintento a 2 s si perfil incompleto (race condition)
  │  isDastProfileComplete() → si false, omite publicación
  │
  ▼
customer.transformer.ts
  │  transformShopifyCustomerToDast()
  │  → DastCustomerPayload
  │
  ▼
rabbitmq.server.ts
  │  publish(routingKey, payload)
  └─► exchange: ecommerce.events  (topic, durable)
        routing key: customer.created | customer.modified

  (solo en customers/update)
  │
  ▼
address.service.ts
  │  publishAddressEvents()
  │    └─ consulta SeenAddress en SQLite
  │    └─ address.created si ID nunca visto, address.modified si ya existe
  │    └─ address.transformer.ts → DastAddressPayload
  └─► publish(address.created | address.modified, payload)
```

---

## Webhooks registrados

### `orders/paid` → `webhooks.orders.paid.tsx`

Disparado cuando una orden es marcada como pagada en Shopify.

**Flujo:**
1. Responde `200` de inmediato.
2. En `setImmediate`, verifica que la orden tenga un `customer.id`; si no, omite.
3. Carga metafields DAST del cliente vía `loadDastMetafieldsForPublish` (sin gate de completitud — se publica independientemente del estado del perfil).
4. Transforma y publica con routing key `order.created`.

> A diferencia de los webhooks de clientes, **no aplica `isDastProfileComplete`**. La orden se publica siempre que exista un cliente asociado.

---

### `customers/create` → `webhooks.customers.create.tsx`

Disparado cuando se crea un nuevo cliente en Shopify.

**Flujo:**
1. Responde `200` de inmediato.
2. En `setImmediate`, carga metafields DAST del cliente vía Admin GraphQL.
3. Si el perfil DAST está incompleto, omite la publicación (comportamiento normal hasta que el cliente complete su perfil).
4. Si está completo, transforma y publica con routing key `customer.created`.

### `customers/update` → `webhooks.customers.update.tsx`

Disparado en cualquier actualización del cliente (datos, direcciones, metafields).

**Flujo:**
1. Responde `200` de inmediato.
2. En `setImmediate`, carga metafields DAST.
3. Si el perfil DAST está incompleto, omite todo.
4. Si está completo:
   - Publica `customer.modified` con el payload del cliente.
   - Itera sobre `customer.addresses` y publica eventos de dirección (`address.created` o `address.modified`) según el estado en SQLite.

---

## Servicios

### `rabbitmq.server.ts`

Gestiona la conexión AMQP y la publicación de mensajes.

**Comportamiento de conexión:**
- Conexión singleton persistente iniciada al arrancar el servidor (`void connect()` al final del módulo).
- Exchange `ecommerce.events` de tipo `topic`, durable, asegurado en cada conexión.
- Ante `error` o `close` de la conexión, programa reconexión automática con `setTimeout` de **5 segundos**.
- Evita reconexiones paralelas con un flag `reconnectTimer`.

**Publicación con reintentos:**
```
publish(routingKey, payload)
  └─ hasta 8 intentos
       └─ connect() si no hay canal
       └─ channel.publish() con persistent: true, contentType: application/json
       └─ si devuelve false (buffer lleno) o no hay canal → espera 2 s y reintenta
       └─ si agota intentos → lanza Error
```

**Constantes:**
```typescript
RECONNECT_DELAY_MS    = 5000   // delay entre reconexiones
PUBLISH_RETRY_DELAY_MS = 2000  // delay entre reintentos de publish
PUBLISH_MAX_ATTEMPTS  = 8      // máximo de intentos de publish
```

---

### `customer.service.ts`

Obtiene los metafields DAST del cliente vía Admin GraphQL API.

**Query:** `getCustomerAllMetafields` — recupera los primeros 100 metafields del cliente por GID.

**Resolución de namespace:**
Los metafields pueden existir en dos namespaces. La prioridad es:
1. `app--*` (namespace propio de la app, creado programáticamente)
2. `custom` (definiciones manuales legacy del merchant)

**Campos resueltos:**

| Campo interno | Metafield key | Lógica especial |
|---|---|---|
| `public_id` | `dast_public_id` | prioridad app > custom |
| `document_type` | `dast_document_type` | parseInt, default 0 |
| `gender` | `dast_gender` | parseInt, default 0 |
| `birth_date` | `dast_birth_date` | prioridad app > custom |
| `telephone` | `dast_telephone` / `dast_phone` | fallback a `custom.dast_phone` |
| `country_code` | `dast_country_code` / `dast_country` | normaliza ES/PT; numérico: 0=PT, 1=ES |
| `contract_public_uuid` | `dast_contract_uuid` | solo namespace `custom` |

---

### `dast-publish-gate.server.ts`

Controla si un perfil DAST está listo para publicar.

**`isDastProfileComplete(metafields)`** — retorna `true` si:
- `public_id` no está vacío
- `document_type >= 1` (entero finito)
- `gender >= 1` (entero finito)
- `birth_date` no está vacío

**`loadDastMetafieldsForPublish(admin, customerId)`** — carga metafields con estrategia de reintento:
```
1ª lectura → si perfil incompleto → espera 2 s → 2ª lectura → retorna
```
El reintento cubre la race condition entre el webhook y la escritura de metafields por parte de la UI Extension.

---

### `customer.transformer.ts`

Mapea el payload de Shopify al formato DAST.

**Entrada:** `ShopifyCustomerPayload` + `CustomerDastMetafields`

**Salida:** `DastCustomerPayload`

```typescript
{
  customer_shop_id,      // payload.id
  contract_public_uuid,  // metafields.contract_public_uuid
  public_id,             // metafields.public_id
  name,                  // first_name + last_name
  email,                 // payload.email
  telephone,             // metafields.telephone || payload.phone
  zip_code,              // addresses[0].zip
  country_code,          // metafields.country_code || addresses[0].country_code
  document_type,         // metafields.document_type
  gender,                // metafields.gender
  birth_date,            // metafields.birth_date
  is_guest: false,
  routing_key: "customer.created"
}
```

---

### `address.service.ts`

Determina si cada dirección del webhook es nueva o ya conocida, y publica el evento correspondiente.

**Lógica:**
```
para cada address en customer.addresses:
  buscar SeenAddress { addressShopId, shop } en SQLite
  si no existe → crear registro + publicar address.created
  si existe    → publicar address.modified
```

La tabla `SeenAddress` usa clave compuesta `(addressShopId, shop)` para soportar múltiples tiendas.

---

### `order.transformer.ts`

Mapea una orden de Shopify al formato DAST.

**Entrada:** `ShopifyOrderPayload` + `CustomerDastMetafields`

**Salida:** `DastOrderPayload` (routing key fija `order.created`)

```typescript
{
  contract_public_uuid,  // metafields.contract_public_uuid
  address_shop_id,       // order.id  (ID de la orden como identificador de dirección)
  customer_shop_id,      // order.customer.id
  alias,                 // shipping_address.name
  company,               // shipping_address.company
  firstname / lastname,  // shipping_address.first_name / last_name
  address1 / address2,
  zip_code,              // shipping_address.zip
  city,
  country_code,          // metafields.country_code || shipping_address.country_code
  state,                 // shipping_address.province
  phone,                 // shipping_address.phone || customer.phone
  customer_email,        // customer.email || order.email
  customer_name,         // customer.first_name + last_name
  customer_dni,          // metafields.public_id
  customer_vat_number,   // metafields.public_id
  is_guest: 0,
  routing_key: "order.created"
}
```

La dirección preferida es `shipping_address`; si es `null`, usa `billing_address` como fallback.

---

### `address.transformer.ts`

Mapea una dirección de Shopify al formato DAST.

**Salida:** `DastAddressPayload`

```typescript
{
  contract_public_uuid,  // metafields.contract_public_uuid
  address_shop_id,       // address.id
  customer_shop_id,      // customer.id
  alias,                 // address.name
  company,               // address.company
  firstname / lastname,  // address.first_name / last_name
  address1 / address2,
  zip_code,              // address.zip
  city,
  country_code,          // metafields.country_code || address.country_code
  state,                 // address.province
  phone,                 // address.phone || customer.phone
  customer_email,        // customer.email
  customer_name,         // customer.first_name + last_name
  customer_dni,          // metafields.public_id
  customer_vat_number,   // metafields.public_id
  is_guest: 0,
  routing_key            // "address.created" | "address.modified"
}
```

---

## Base de datos (Prisma + SQLite)

### Modelos

**`Session`** — Gestión de sesiones OAuth de Shopify (requerido por `@shopify/shopify-app-react-router`).

**`SeenAddress`** — Registro de direcciones ya procesadas para distinguir `address.created` de `address.modified`.

```prisma
model SeenAddress {
  addressShopId   BigInt
  customerShopId  BigInt
  shop            String
  createdAt       DateTime @default(now())

  @@id([addressShopId, shop])
}
```

---

## Extensión UI — `customer-profile-fields`

UI Extension de tipo `ui_extension` que se renderiza en el target `customer-account.profile.block.render` (página de perfil del Customer Account).

**Propósito:** Permite al cliente completar su perfil DAST (documento, género, fecha de nacimiento, etc.) directamente desde su cuenta de Shopify.

**Metafields declarados en `shopify.extension.toml`:**
- `custom.dast_public_id`
- `custom.dast_document_type`
- `custom.dast_gender`
- `custom.dast_birth_date`

**Capacidades:** `api_access: true`, `network_access: true`

Cuando el cliente guarda el formulario, Shopify actualiza los metafields, lo que dispara el webhook `customers/update`, que a su vez publica `customer.modified` si el perfil queda completo.

---

## Eventos publicados en RabbitMQ

| Routing Key | Disparado por | Descripción |
|---|---|---|
| `customer.created` | `customers/create` | Cliente nuevo con perfil DAST completo |
| `customer.modified` | `customers/update` | Actualización de cliente con perfil DAST completo |
| `address.created` | `customers/update` | Primera vez que se ve una dirección del cliente |
| `address.modified` | `customers/update` | Actualización de una dirección ya conocida |
| `order.created` | `orders/paid` | Orden pagada con cliente asociado |

**Exchange:** `ecommerce.events` (topic, durable)  
**Mensajes:** JSON serializado, `persistent: true`, `contentType: application/json`

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `RABBITMQ_URL` | `amqp://desarrollo:desarrollo@localhost:5672` | URL de conexión AMQP |
| `DATABASE_URL` | `file:dev.sqlite` | Ruta de la base de datos SQLite |
| `SHOPIFY_API_KEY` | — | API Key de la app en Shopify Partners |
| `SHOPIFY_API_SECRET` | — | API Secret de la app |
| `SCOPES` | — | Scopes OAuth requeridos |

---

## Estructura del proyecto

```
app/
├── routes/
│   ├── webhooks.customers.create.tsx   # Webhook customers/create
│   ├── webhooks.customers.update.tsx   # Webhook customers/update
│   ├── webhooks.orders.paid.tsx        # Webhook orders/paid
│   └── app._index.tsx                  # UI embebida (admin)
├── services/
│   ├── rabbitmq.server.ts              # Conexión AMQP y publicación
│   ├── customer.service.ts             # Fetch metafields vía GraphQL
│   ├── customer.transformer.ts         # Mapeo Shopify → DAST (cliente)
│   ├── dast-publish-gate.server.ts     # Validación de perfil completo
│   ├── address.service.ts              # Lógica address.created/modified
│   ├── address.transformer.ts          # Mapeo Shopify → DAST (dirección)
│   └── order.transformer.ts            # Mapeo Shopify → DAST (orden)
├── shopify.server.ts                   # Configuración Shopify SDK
└── db.server.ts                        # Cliente Prisma singleton

extensions/
└── customer-profile-fields/
    ├── src/Extension.tsx               # UI Extension (Customer Account)
    └── shopify.extension.toml          # Configuración de la extensión

prisma/
├── schema.prisma                       # Modelos Session + SeenAddress
└── dev.sqlite                          # Base de datos local
```

---

## Consideraciones de diseño

### Respuesta inmediata al webhook
Los webhooks responden `200` antes de procesar. El procesamiento ocurre en `setImmediate` para no bloquear el event loop y evitar timeouts de Shopify (5 s).

### Race condition metafields vs webhook
Shopify puede disparar el webhook `customers/update` antes de que la Admin API refleje los metafields recién guardados por la UI Extension. El gate implementa un reintento con 2 s de espera para cubrir esta ventana.

### Idempotencia de direcciones
La tabla `SeenAddress` actúa como registro de estado. Si la app se reinicia, las direcciones ya procesadas siguen siendo reconocidas como `modified` en lugar de `created`.

### Conexión AMQP persistente
La conexión se establece al arrancar el servidor y se mantiene viva con reconexión automática. Esto evita la latencia de conectar en cada webhook y garantiza que los mensajes se publiquen incluso si RabbitMQ tuvo una interrupción breve.
