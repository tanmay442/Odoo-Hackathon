CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'confirmed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'delivering', 'delivered', 'dead');--> statement-breakpoint
CREATE TABLE "invoice_discounts" (
	"invoice_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"discarded_amount_minor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_discounts_invoice_id_discount_id_pk" PRIMARY KEY("invoice_id","discount_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_taxes" (
	"invoice_line_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"taxable_amount_minor" bigint NOT NULL,
	"tax_amount_minor" bigint NOT NULL,
	CONSTRAINT "invoice_line_taxes_invoice_line_id_tax_id_pk" PRIMARY KEY("invoice_line_id","tax_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_taxes" (
	"invoice_id" uuid NOT NULL,
	"tax_id" uuid NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"taxable_amount_minor" bigint NOT NULL,
	"tax_amount_minor" bigint NOT NULL,
	CONSTRAINT "invoice_taxes_invoice_id_tax_id_pk" PRIMARY KEY("invoice_id","tax_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_discounts_invoice_id_idx" ON "invoice_discounts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_discounts_discount_id_idx" ON "invoice_discounts" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX "invoice_line_taxes_line_id_idx" ON "invoice_line_taxes" USING btree ("invoice_line_id");--> statement-breakpoint
CREATE INDEX "invoice_line_taxes_tax_id_idx" ON "invoice_line_taxes" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_taxes_invoice_id_idx" ON "invoice_taxes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_id_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "outbox_status_next_idx" ON "outbox_events" USING btree ("status","next_attempt_at");