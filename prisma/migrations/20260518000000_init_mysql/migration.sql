-- Migración inicial consolidada para MySQL
-- Reemplaza todas las migraciones SQLite anteriores

-- CreateTable Session
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `shop` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `scope` VARCHAR(191) NULL,
    `expires` DATETIME(3) NULL,
    `accessToken` VARCHAR(191) NOT NULL,
    `userId` BIGINT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `accountOwner` BOOLEAN NOT NULL DEFAULT false,
    `locale` VARCHAR(191) NULL,
    `collaborator` BOOLEAN NULL DEFAULT false,
    `emailVerified` BOOLEAN NULL DEFAULT false,
    `refreshToken` VARCHAR(191) NULL,
    `refreshTokenExpires` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable SeenAddress
CREATE TABLE `SeenAddress` (
    `addressShopId` BIGINT NOT NULL,
    `customerShopId` BIGINT NOT NULL,
    `shop` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`addressShopId`, `shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ShopIntegrationSettings
CREATE TABLE `ShopIntegrationSettings` (
    `shop` VARCHAR(191) NOT NULL,
    `rabbitmqHost` VARCHAR(191) NOT NULL DEFAULT '',
    `rabbitmqUser` VARCHAR(191) NOT NULL DEFAULT '',
    `rabbitmqPassword` VARCHAR(191) NOT NULL DEFAULT '',
    `rabbitmqPort` INTEGER NOT NULL DEFAULT 5672,
    `rabbitmqVhost` VARCHAR(191) NOT NULL DEFAULT '/',
    `pdsApiKey` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ShopProfileFormSettings
CREATE TABLE `ShopProfileFormSettings` (
    `shop` VARCHAR(191) NOT NULL,
    `profileFormEnablePortugal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
