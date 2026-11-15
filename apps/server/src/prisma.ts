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
