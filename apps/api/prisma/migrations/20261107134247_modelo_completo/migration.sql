-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "Modal" AS ENUM ('AEREO', 'RODOVIARIO', 'FTL');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "Airline" AS ENUM ('GOL', 'AZUL', 'LATAM');

-- CreateEnum
CREATE TYPE "Locality" AS ENUM ('CAPITAL', 'INTERIOR');

-- CreateEnum
CREATE TYPE "FtlVehicle" AS ENUM ('UTILITARIO', 'VAN', 'TRES_QUARTOS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERACIONAL',
    "can_edit_rates" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "useful_links" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "useful_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "modal" "Modal" NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDENTE',
    "client_id" UUID,
    "client_name" TEXT,
    "origin_city" TEXT,
    "origin_uf" CHAR(2),
    "dest_city" TEXT,
    "dest_uf" CHAR(2),
    "cost_road" DECIMAL(14,2),
    "cost_pickup" DECIMAL(14,2),
    "cost_air" DECIMAL(14,2),
    "cost_delivery" DECIMAL(14,2),
    "toll" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "markup_pct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "ftl_rate_id" UUID,
    "ftl_rate_version" INTEGER,
    "ftl_locality" "Locality",
    "vehicle" "FtlVehicle",
    "distance_km" DECIMAL(10,2),
    "rate_per_km" DECIMAL(12,4),
    "ad_valorem_pct" DECIMAL(9,4) NOT NULL,
    "goods_value" DECIMAL(14,2),
    "cost_total" DECIMAL(14,2) NOT NULL,
    "markup_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" UUID,
    "duplicated_from_id" UUID,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_status_changes" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "from_status" "QuoteStatus",
    "to_status" "QuoteStatus" NOT NULL,
    "user_id" UUID NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "air_rates" (
    "id" UUID NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "airline" "Airline" NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "urgent_per_kg" DECIMAL(12,4),
    "urgent_min" DECIMAL(14,2),
    "fast_per_kg" DECIMAL(12,4),
    "fast_min" DECIMAL(14,2),
    "economy_per_kg" DECIMAL(12,4),
    "economy_min" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "air_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "air_rate_history" (
    "id" UUID NOT NULL,
    "air_rate_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" UUID,
    "username" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "air_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ftl_rates" (
    "id" UUID NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "region" TEXT NOT NULL,
    "locality" "Locality" NOT NULL,
    "per_km_utility" DECIMAL(12,4) NOT NULL,
    "per_km_van" DECIMAL(12,4) NOT NULL,
    "per_km_15t" DECIMAL(12,4) NOT NULL,
    "ad_valorem_pct" DECIMAL(9,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ftl_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ftl_rate_history" (
    "id" UUID NOT NULL,
    "ftl_rate_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" UUID,
    "username" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ftl_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE INDEX "quotes_created_at_idx" ON "quotes"("created_at");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_modal_idx" ON "quotes"("modal");

-- CreateIndex
CREATE INDEX "quotes_client_id_idx" ON "quotes"("client_id");

-- CreateIndex
CREATE INDEX "quote_status_changes_quote_id_idx" ON "quote_status_changes"("quote_id");

-- CreateIndex
CREATE INDEX "air_rates_origin_destination_airline_idx" ON "air_rates"("origin", "destination", "airline");

-- CreateIndex
CREATE INDEX "air_rate_history_air_rate_id_idx" ON "air_rate_history"("air_rate_id");

-- CreateIndex
CREATE INDEX "ftl_rates_uf_locality_idx" ON "ftl_rates"("uf", "locality");

-- CreateIndex
CREATE INDEX "ftl_rate_history_ftl_rate_id_idx" ON "ftl_rate_history"("ftl_rate_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_ftl_rate_id_fkey" FOREIGN KEY ("ftl_rate_id") REFERENCES "ftl_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_status_changes" ADD CONSTRAINT "quote_status_changes_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_status_changes" ADD CONSTRAINT "quote_status_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "air_rate_history" ADD CONSTRAINT "air_rate_history_air_rate_id_fkey" FOREIGN KEY ("air_rate_id") REFERENCES "air_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ftl_rate_history" ADD CONSTRAINT "ftl_rate_history_ftl_rate_id_fkey" FOREIGN KEY ("ftl_rate_id") REFERENCES "ftl_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
