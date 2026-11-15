import { PrismaClient, type Prisma } from "@prisma/client";
import { config } from "@card-table/config";

let client: PrismaClient | undefined;

export function getPrismaClient() {
  if (!client && config.DATABASE_URL) client = new PrismaClient();
  return client;
}

export async function disconnectPrisma() {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export async function checkDatabaseReadiness(timeoutMs = 1_500) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false, reason: "DATABASE_URL is not configured" };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("database readiness timeout")), timeoutMs);
      }),
    ]);
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: "database is unavailable" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function persistWalletSnapshot(userId: string, balance: number, amount: number, reason: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    await transaction.virtualWallet.upsert({
      where: { userId },
      create: { userId, balance: BigInt(balance) },
      update: { balance: BigInt(balance) },
    });
    await transaction.chipTransaction.create({
      data: { userId, amount: BigInt(amount), balanceAfter: BigInt(balance), reason },
    });
  });
}
