-- One client can hold a key for a sync that walks every page and a key for an
-- agent that asks one question. Sharing one counter, the first starves the
-- second, so a key gets its own budget and may carry its own limit.
ALTER TABLE "ApiKey" ADD COLUMN "rateLimit" INTEGER;
