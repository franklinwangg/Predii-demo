import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!connectionString) {
    throw new HttpError(
      "DATABASE_URL is not configured. Copy .env.example to .env, then run the database setup commands.",
      503,
    );
  }
  if (!globalForPrisma.prisma) {
    const configuredPoolMax = process.env.DATABASE_POOL_MAX;
    const poolMax = configuredPoolMax === undefined ? undefined : Number(configuredPoolMax);
    if (poolMax !== undefined && (!Number.isSafeInteger(poolMax) || poolMax < 1)) {
      throw new Error("DATABASE_POOL_MAX must be a positive integer.");
    }
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, max: poolMax }),
    });
  }
  return globalForPrisma.prisma;
}
