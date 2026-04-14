-- CreateTable
CREATE TABLE "ShopIntegrationSettings" (
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
