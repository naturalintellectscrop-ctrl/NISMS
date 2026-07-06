-- Identity hardening: session revocation, atomic receipt counters, tenant branding.

-- AlterTable: users.tokenVersion
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: school_settings.footerText
ALTER TABLE "school_settings" ADD COLUMN "footerText" TEXT;

-- CreateTable: receipt_counters
CREATE TABLE "receipt_counters" (
    "schoolId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("schoolId")
);

-- Backfill counters from existing receipt numbers (format RCT-NNNNNN)
INSERT INTO "receipt_counters" ("schoolId", "lastNumber")
SELECT "schoolId", COALESCE(MAX(CAST(SUBSTRING("receiptNumber" FROM 5) AS INTEGER)), 0)
FROM "payments"
WHERE "receiptNumber" ~ '^RCT-[0-9]+$'
GROUP BY "schoolId";
