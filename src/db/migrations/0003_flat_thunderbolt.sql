CREATE TYPE "public"."discount_kind" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."discount_scope" AS ENUM('product', 'subscription');--> statement-breakpoint
CREATE TABLE "discount_products" (
	"discount_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "discount_products_discount_id_product_id_pk" PRIMARY KEY("discount_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"value_minor_or_basis_points" bigint NOT NULL,
	"min_purchase_minor" bigint,
	"min_quantity" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"times_redeemed" integer DEFAULT 0 NOT NULL,
	"scope" "discount_scope" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_value_non_negative" CHECK (value_minor_or_basis_points >= 0),
	CONSTRAINT "discounts_times_redeemed_non_negative" CHECK (times_redeemed >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_discounts" (
	"subscription_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"attached_by" text NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_discounts_subscription_id_discount_id_pk" PRIMARY KEY("subscription_id","discount_id")
);
--> statement-breakpoint
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_discounts" ADD CONSTRAINT "subscription_discounts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_discounts" ADD CONSTRAINT "subscription_discounts_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_products_product_id_idx" ON "discount_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "discounts_scope_active_idx" ON "discounts" USING btree ("scope","is_active");--> statement-breakpoint
CREATE INDEX "discounts_redeemable_idx" ON "discounts" USING btree ("is_active","times_redeemed");--> statement-breakpoint
CREATE INDEX "discounts_kind_idx" ON "discounts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "subscription_discounts_discount_id_idx" ON "subscription_discounts" USING btree ("discount_id");