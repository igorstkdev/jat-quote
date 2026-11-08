-- AlterTable
ALTER TABLE "air_rates" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "ftl_rates" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;
