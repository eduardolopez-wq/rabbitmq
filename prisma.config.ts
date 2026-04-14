import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Cargar .env desde la raíz del repo (import.meta apunta a este archivo).
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectRoot, ".env") });

/** Fallback local si DATABASE_URL no está en el entorno ni en .env. */
const databaseUrl =
  process.env.DATABASE_URL?.trim() || "file:./dev.sqlite";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: databaseUrl,
  },
});
