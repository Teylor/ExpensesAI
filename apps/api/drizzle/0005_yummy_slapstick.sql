CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" uuid NOT NULL,
	"destination_account_id" uuid,
	"category_id" uuid,
	"amount" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"destination_amount" numeric(20, 8),
	"destination_currency" text,
	"fx_rate_to_base" numeric(20, 8),
	"occurred_at_utc" timestamp with time zone NOT NULL,
	"local_date" text NOT NULL,
	"timezone" text NOT NULL,
	"description" text NOT NULL,
	"client_or_payee" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_user_scope_idx" ON "categories" USING btree ("user_id","scope");--> statement-breakpoint
CREATE INDEX "transactions_user_local_date_idx" ON "transactions" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "transactions_user_account_idx" ON "transactions" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "transactions_user_external_idx" ON "transactions" USING btree ("user_id","external_id");