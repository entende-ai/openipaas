-- Roles for console accounts.
--
-- Existing rows become OWNER: whoever is already signed in set the deployment
-- up, and demoting them on deploy would lock the console's only person out of
-- managing it. New accounts default to MEMBER.
ALTER TABLE "DashboardUser" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'MEMBER';

UPDATE "DashboardUser" SET "role" = 'OWNER';
