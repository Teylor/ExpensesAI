CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" integer,
	"day_of_week" integer,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered_local_date" text,
	"next_due_local_date" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rules_user_active_idx" ON "recurring_rules" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "recurring_rules_next_due_idx" ON "recurring_rules" USING btree ("is_active","next_due_local_date");