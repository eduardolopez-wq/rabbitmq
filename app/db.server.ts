import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.sqlite";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrisma();
  }
}

const prisma = global.prismaGlobal ?? createPrisma();

export default prisma;
