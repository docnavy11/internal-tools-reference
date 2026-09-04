CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_id" uuid,
	"notes" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customers_status_check" CHECK ("customers"."status" in ('lead', 'active', 'churned')),
	CONSTRAINT "customers_plan_check" CHECK ("customers"."plan" in ('free', 'pro', 'enterprise'))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_owner_idx" ON "customers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customers_created_by_idx" ON "customers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "customers_updated_by_idx" ON "customers" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "customers_live_idx" ON "customers" USING btree ("created_at") WHERE "customers"."deleted_at" is null;