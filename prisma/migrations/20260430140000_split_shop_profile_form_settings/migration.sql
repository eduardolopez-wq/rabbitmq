-- Tabla solo para opciones del formulario de datos personales (cuenta cliente).
CREATE TABLE "ShopProfileFormSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "profileFormEnablePortugal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Copiar valores existentes desde la tabla de integración.
INSERT INTO "ShopProfileFormSettings" ("shop", "profileFormEnablePortugal", "createdAt", "updatedAt")
SELECT "shop", "profileFormEnablePortugal", "createdAt", "updatedAt"
FROM "ShopIntegrationSettings";

-- Quitar la columna del modelo de integración (RabbitMQ / PDS).
PRAGMA foreign_keys=OFF;
CREATE TABLE "ShopIntegrationSettings_new" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "rabbitmqHost" TEXT NOT NULL DEFAULT '',
    "rabbitmqUser" TEXT NOT NULL DEFAULT '',
    "rabbitmqPassword" TEXT NOT NULL DEFAULT '',
    "rabbitmqPort" INTEGER NOT NULL DEFAULT 5672,
    "rabbitmqVhost" TEXT NOT NULL DEFAULT '/',
    "pdsApiKey" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "ShopIntegrationSettings_new" (
    "shop", "rabbitmqHost", "rabbitmqUser", "rabbitmqPassword",
    "rabbitmqPort", "rabbitmqVhost", "pdsApiKey", "createdAt", "updatedAt"
)
SELECT
    "shop", "rabbitmqHost", "rabbitmqUser", "rabbitmqPassword",
    "rabbitmqPort", "rabbitmqVhost", "pdsApiKey", "createdAt", "updatedAt"
FROM "ShopIntegrationSettings";

DROP TABLE "ShopIntegrationSettings";
ALTER TABLE "ShopIntegrationSettings_new" RENAME TO "ShopIntegrationSettings";
PRAGMA foreign_keys=ON;
