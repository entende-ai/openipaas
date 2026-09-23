-- Connecting an account was a person in this console picking a client from a
-- list of every client in the deployment. A connect session is the same act,
-- delegated: a one-time link a product hands to its own customer.
CREATE TABLE "ConnectSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "provider" TEXT,
    "redirectUrl" TEXT,
    "origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "label" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "linkedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectSession_tokenHash_key" ON "ConnectSession"("tokenHash");
CREATE INDEX "ConnectSession_clientId_idx" ON "ConnectSession"("clientId");
CREATE INDEX "ConnectSession_expiresAt_idx" ON "ConnectSession"("expiresAt");

ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The callback has to know it is finishing a delegated flow rather than one
-- started inside the console.
ALTER TABLE "OAuthState" ADD COLUMN "connectSessionId" TEXT;
