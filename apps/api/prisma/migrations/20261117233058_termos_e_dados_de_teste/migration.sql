-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "is_test_data" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terms" JSONB;
