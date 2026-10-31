CREATE TYPE "public"."subscription_status" AS ENUM('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_line_taxes" (
	"subscription_line_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_lines_quantity_check" CHECK (quantity >= 1)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'draft' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"expiry_date" timestamp with time zone NOT NULL,
	"payment_terms" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"next_billing_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"source_template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "quotation_template_line_taxes" (
	"template_line_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_template_lines_quantity_check" CHECK (quantity >= 1)
);
--> statement-breakpoint
CREATE TABLE "quotation_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_identifier" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_line_taxes" ADD CONSTRAINT "subscription_line_taxes_subscription_line_id_subscription_lines_id_fk" FOREIGN KEY ("subscription_line_id") REFERENCES "public"."subscription_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_line_taxes" ADD CONSTRAINT "subscription_line_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_template_id_quotation_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."quotation_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_template_line_taxes" ADD CONSTRAINT "quotation_template_line_taxes_template_line_id_quotation_template_lines_id_fk" FOREIGN KEY ("template_line_id") REFERENCES "public"."quotation_template_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_template_line_taxes" ADD CONSTRAINT "quotation_template_line_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_template_lines" ADD CONSTRAINT "quotation_template_lines_template_id_quotation_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quotation_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_template_lines" ADD CONSTRAINT "quotation_template_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_template_lines" ADD CONSTRAINT "quotation_template_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_templates" ADD CONSTRAINT "quotation_templates_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_lines_subscription_id_idx" ON "subscription_lines" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_billing_idx" ON "subscriptions" USING btree ("status","next_billing_at");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_id_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
INSERT INTO "counters" ("name", "value") VALUES ('subscription', 0) ON CONFLICT DO NOTHING;
