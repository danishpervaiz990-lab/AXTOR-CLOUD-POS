ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "waiter_id" TEXT;
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "tip" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "delivery_status" TEXT;
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "course_status" TEXT NOT NULL DEFAULT 'held';
ALTER TABLE "hardware_rental_contracts" ADD COLUMN IF NOT EXISTS "rental_charge" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "hardware_rental_contracts" ADD COLUMN IF NOT EXISTS "damage_charge" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "hardware_rental_contracts" ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "paint_mix_jobs" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);
