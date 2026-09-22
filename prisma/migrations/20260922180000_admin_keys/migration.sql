-- Creating a client and issuing its key were a person in the dashboard. An
-- admin key makes them a step a program can take, with a credential that is
-- not any client's and cannot be confused for one.
CREATE TABLE "AdminKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminKey_keyHash_key" ON "AdminKey"("keyHash");
