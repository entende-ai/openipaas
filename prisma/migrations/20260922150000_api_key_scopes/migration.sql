-- A key used to reach everything its client had. Scopes let one key read while
-- another writes, which is what makes a key safe to hand to an agent.
ALTER TABLE "ApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing keys are spelled out rather than left empty, so what a key can do is
-- readable in the dashboard instead of implied by an absence.
UPDATE "ApiKey" SET "scopes" = ARRAY['read:*', 'write:*'] WHERE cardinality("scopes") = 0;
