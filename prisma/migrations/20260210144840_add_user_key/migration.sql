-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "userKey" VARCHAR(64);

-- CreateIndex
CREATE INDEX "Transaction_userKey_occurredAt_idx" ON "Transaction"("userKey", "occurredAt");
