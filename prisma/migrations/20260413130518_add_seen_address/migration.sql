-- CreateTable
CREATE TABLE "SeenAddress" (
    "addressShopId" BIGINT NOT NULL,
    "customerShopId" BIGINT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("addressShopId", "shop")
);
